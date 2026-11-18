<?php
/**
 * Chart tests.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Datasets;
use SugarCommerce\Reports\Format;
use SugarCommerce\Reports\Traits\ComponentRenderer;
use PHPUnit\Framework\TestCase;

/**
 * What a chart is drawn with.
 *
 * The canvas carries its whole configuration, and the script draws exactly
 * that. So every option is asserted on the configuration the page carries --
 * which is also the thing a consumer used to have to write a renderer of its
 * own to change.
 */
final class ChartTest extends TestCase {

	protected function tearDown(): void {
		unset( $GLOBALS['rp_locale'] );
	}

	/**
	 * An object with the renderer on it.
	 *
	 * @return object
	 */
	private function renderer(): object {
		return new class {
			use ComponentRenderer;

			/**
			 * @var array<string, mixed>
			 */
			protected array $date_range = [ 'start' => '2026-08-01', 'end' => '2026-08-31', 'preset' => 'this_month' ];

			/**
			 * @var array<string, mixed>
			 */
			protected array $config = [];

			/**
			 * The period label, which the date-range trait normally supplies.
			 *
			 * @return string
			 */
			protected function get_period_label(): string {
				return 'This month';
			}

			/**
			 * Render one and hand back what it printed.
			 *
			 * @param string $id        Component id.
			 * @param array  $component Component configuration.
			 *
			 * @return string
			 */
			public function draw( string $id, array $component ): string {
				ob_start();

				try {
					$this->render_component( $id, $component );
				} finally {
					$html = (string) ob_get_clean();
				}

				return $html;
			}
		};
	}

	/**
	 * Draw a chart and read back the configuration its canvas carries.
	 *
	 * @param array $component Component configuration.
	 * @param array $data      What its data callback returns.
	 *
	 * @return array
	 */
	private function config( array $component, array $data = [] ): array {
		$html = $this->renderer()->draw( 'sales', $component + [ 'type' => 'chart', 'data_callback' => fn() => $data ] );

		$this->assertSame( 1, preg_match( '/data-chart-config="([^"]*)"/', $html, $match ), 'No canvas configuration.' );

		return json_decode( html_entity_decode( $match[1], ENT_QUOTES ), true );
	}

	/**
	 * Two series of the same length.
	 *
	 * @return array
	 */
	private static function two_series(): array {
		return [
			'labels'   => [ 'Mon', 'Tue' ],
			'datasets' => [
				Datasets::line( 'Net revenue', [ 10, 20 ], '#3858e9' ),
				Datasets::line( 'Orders', [ 1, 2 ], '#9aa0a6', [ 'yAxisID' => 'y1' ] ),
			],
		];
	}

	/**
	 * Anything the keys do not cover goes through `options`, laid over what
	 * the keys built rather than replacing it.
	 */
	public function test_options_are_laid_over_what_was_built(): void {
		$config = $this->config(
			[
				'chart_type' => 'line',
				'options'    => [
					'scales'  => [ 'y' => [ 'max' => 500 ] ],
					'plugins' => [ 'title' => [ 'display' => true ] ],
				],
			],
			self::two_series()
		);

		$this->assertSame( 500, $config['options']['scales']['y']['max'] );
		$this->assertTrue( $config['options']['scales']['y']['beginAtZero'], 'A sibling of the override was lost.' );
		$this->assertSame( 4, $config['options']['scales']['y']['ticks']['maxTicksLimit'] );
		$this->assertTrue( $config['options']['plugins']['title']['display'] );
		$this->assertArrayHasKey( 'tooltip', $config['options']['plugins'] );
	}

	/**
	 * A list is replaced, not merged index by index.
	 */
	public function test_a_list_in_options_replaces_the_one_built(): void {
		$merged = \SugarCommerce\Reports\Reports::merge_chart_options(
			[ 'colors' => [ 'a', 'b', 'c' ], 'keep' => 1 ],
			[ 'colors' => [ 'z' ] ]
		);

		$this->assertSame( [ 'colors' => [ 'z' ], 'keep' => 1 ], $merged );
	}

	/**
	 * Money up the side, in the currency asked for, formatted by the browser.
	 */
	public function test_a_currency_axis_is_formatted_by_the_browser(): void {
		$config = $this->config(
			[
				'value_format' => 'currency',
				'currency'     => 'jpy',
			],
			self::two_series()
		);

		$this->assertSame(
			[
				'style'               => 'currency',
				'currency'            => 'JPY',
				'trailingZeroDisplay' => 'stripIfInteger',
			],
			$config['options']['scales']['y']['ticks']['format']
		);
	}

	/**
	 * And in the admin's own locale.
	 */
	public function test_the_locale_is_the_admins(): void {
		$GLOBALS['rp_locale'] = 'de_DE';

		$this->assertSame( 'de-DE', $this->config( [], self::two_series() )['options']['locale'] );
	}

	/**
	 * A second axis on the right for a count, with no grid of its own.
	 */
	public function test_a_secondary_axis_is_a_count_on_the_right(): void {
		$config = $this->config( [ 'secondary_axis' => true ], self::two_series() );
		$y1     = $config['options']['scales']['y1'];

		$this->assertSame( 'right', $y1['position'] );
		$this->assertFalse( $y1['grid']['drawOnChartArea'] );
		$this->assertSame( 0, $y1['ticks']['precision'] );
		$this->assertSame( 'y1', $config['data']['datasets'][1]['yAxisID'] );
	}

	public function test_no_secondary_axis_unless_asked(): void {
		$this->assertArrayNotHasKey( 'y1', $this->config( [], self::two_series() )['options']['scales'] );
	}

	/**
	 * One series needs no legend: its name is the title. Two do.
	 */
	public function test_the_legend_shows_only_for_more_than_one_series(): void {
		$one = [
			'labels'   => [ 'Mon' ],
			'datasets' => [ Datasets::line( 'Net revenue', [ 10 ] ) ],
		];

		$this->assertFalse( $this->config( [], $one )['options']['plugins']['legend']['display'] );
		$this->assertTrue( $this->config( [], self::two_series() )['options']['plugins']['legend']['display'] );
		$this->assertTrue( $this->config( [ 'show_legend' => true ], $one )['options']['plugins']['legend']['display'] );
		$this->assertFalse( $this->config( [ 'show_legend' => false ], self::two_series() )['options']['plugins']['legend']['display'] );
	}

	/**
	 * A pie's legend names its slices, so one dataset still has one. It
	 * had none: every pie on a report was colours nobody could name.
	 */
	public function test_a_pie_or_doughnut_names_its_slices(): void {
		$slices = [
			'labels'   => [ 'Complete', 'Failed' ],
			'datasets' => [
				[
					'label' => 'Orders',
					'data'  => [ 8, 2 ],
				],
			],
		];

		$this->assertTrue( $this->config( [ 'chart_type' => 'pie' ], $slices )['options']['plugins']['legend']['display'] );
		$this->assertTrue( $this->config( [ 'chart_type' => 'doughnut' ], $slices )['options']['plugins']['legend']['display'] );
		$this->assertFalse( $this->config( [ 'chart_type' => 'pie', 'show_legend' => false ], $slices )['options']['plugins']['legend']['display'] );
		$this->assertFalse( $this->config( [ 'chart_type' => 'bar' ], $slices )['options']['plugins']['legend']['display'] );
	}

	/**
	 * The first dataset's own type decides the chart, which is how bars are
	 * drawn when the period turned out short.
	 */
	public function test_the_first_dataset_decides_the_type(): void {
		$data = [
			'labels'   => [ 'Jan', 'Feb' ],
			'datasets' => [ Datasets::bars( 'Sales', [ 1, 2 ] ) ],
		];

		$this->assertSame( 'bar', $this->config( [ 'chart_type' => 'line' ], $data )['type'] );
	}

	/**
	 * `auto`: bars for a few buckets, a line for many.
	 */
	public function test_auto_is_bars_for_few_buckets_and_a_line_for_many(): void {
		$series = static fn( int $count ): array => [
			'labels'   => range( 1, $count ),
			'datasets' => [ [ 'label' => 'Sales', 'data' => array_fill( 0, $count, 1 ) ] ],
		];

		$this->assertSame( 'bar', $this->config( [ 'chart_type' => 'auto' ], $series( 12 ) )['type'] );
		$this->assertSame( 'line', $this->config( [ 'chart_type' => 'auto' ], $series( 13 ) )['type'] );
		$this->assertSame( 'bar', $this->config( [ 'chart_type' => 'auto', 'bars_max' => 31 ], $series( 30 ) )['type'] );
	}

	/**
	 * The figure above the chart, how it has changed, and a sentence under
	 * them -- in the tiles' classes, escaped.
	 */
	public function test_a_headline_and_a_caption_are_drawn_above_the_chart(): void {
		$html = $this->renderer()->draw(
			'sales',
			[
				'type'          => 'chart',
				'title'         => 'Net revenue',
				'show_period'   => false,
				'description'   => 'Unused when there is a caption.',
				'headline'      => fn( array $range ) => [
					'value'     => '£1,204 <b>',
					'change'    => '12% vs previous period',
					'direction' => 'down',
				],
				'caption'       => fn( array $range ) => 'From ' . $range['start'] . ' <i>',
				'data_callback' => fn() => self::two_series(),
			]
		);

		$this->assertStringContainsString( '<div class="reports-tile-value">£1,204 &lt;b&gt;</div>', $html );
		$this->assertStringContainsString( 'reports-tile-change change-down', $html );
		$this->assertStringContainsString( Format::change_icon( 'down' ), $html );
		$this->assertStringContainsString( '12% vs previous period', $html );
		$this->assertStringContainsString( 'From 2026-08-01 &lt;i&gt;', $html );
		$this->assertStringNotContainsString( 'Unused when there is a caption.', $html );
		$this->assertStringNotContainsString( 'reports-chart-period', $html );
	}

	/**
	 * No change is a figure alone; an empty caption falls back to the
	 * description; the period is on by default.
	 */
	public function test_a_headline_without_a_change_is_the_figure_alone(): void {
		$html = $this->renderer()->draw(
			'sales',
			[
				'type'          => 'chart',
				'title'         => 'Net revenue',
				'description'   => 'What came in.',
				'headline'      => [ 'value' => '£0', 'change' => '' ],
				'caption'       => fn() => '',
				'data_callback' => fn() => self::two_series(),
			]
		);

		$this->assertStringContainsString( '<div class="reports-tile-value">£0</div>', $html );
		$this->assertStringNotContainsString( 'reports-tile-change', $html );
		$this->assertStringContainsString( 'What came in.', $html );
		$this->assertStringContainsString( 'reports-chart-period', $html );
	}

	/**
	 * A caption that happens to name a function is words, not a call.
	 */
	public function test_a_caption_naming_a_function_is_not_called(): void {
		$html = $this->renderer()->draw(
			'sales',
			[
				'type'          => 'chart',
				'title'         => 'Sales',
				'caption'       => 'phpinfo',
				'data_callback' => fn() => self::two_series(),
			]
		);

		$this->assertStringContainsString( '<p class="reports-chart-description">phpinfo</p>', $html );
	}

	/**
	 * Labels level and thinned, faint horizontal lines only.
	 */
	public function test_the_axes_have_the_reports_look(): void {
		$scales = $this->config( [], self::two_series() )['options']['scales'];

		$this->assertSame( 0, $scales['x']['ticks']['maxRotation'] );
		$this->assertFalse( $scales['x']['grid']['display'] );
		$this->assertFalse( $scales['y']['border']['display'] );
	}
}
