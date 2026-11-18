<?php
/**
 * Icon tests: every place an icon is drawn takes either form.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Format;
use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Utils\Runtime;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

/**
 * A report hands over icons in two forms and the library draws a few of its
 * own.
 *
 * `heroicons-outline:key` is drawn as inline SVG; `admin-network` or
 * `dashicons-admin-network` as the Dashicons span it always was, so a report
 * written before there were icon sets looks as it did. The library's own --
 * the arrow beside a change, the caret on the date picker, the calendar under
 * the exports, the empty screen's chart and a tile's default -- are Heroicons.
 *
 * Each place is checked against the markup the helper draws for the icon it
 * should be, not only for an `<svg`: an SVG of the wrong icon passes the
 * second and fails the first.
 */
final class IconTest extends TestCase {

	protected function tearDown(): void {
		Registry::instance()->unregister( 'takings' );

		unset( $GLOBALS['rr_localized'] );

		$_GET = [];
	}

	/**
	 * A report with its drawing reachable.
	 *
	 * @param array<string, mixed> $config Its configuration.
	 *
	 * @return Reports
	 */
	private function report( array $config = [] ): Reports {
		return new class( 'takings', $config ) extends Reports {

			/**
			 * Capture whatever a method echoes.
			 *
			 * @param string $method  Method to call.
			 * @param mixed  ...$args Arguments for it.
			 *
			 * @return string
			 */
			public function capture( string $method, ...$args ): string {
				ob_start();

				try {
					$this->$method( ...$args );
				} finally {
					$markup = (string) ob_get_clean();
				}

				return $markup;
			}

			/**
			 * Show a period.
			 *
			 * @param array<string, string> $range preset, start and end.
			 *
			 * @return static
			 */
			public function with_range( array $range ): static {
				$this->date_range = $range;

				return $this;
			}

			/**
			 * Call a protected method and return what it returns.
			 *
			 * @param string $method  Method to call.
			 * @param mixed  ...$args Arguments for it.
			 *
			 * @return mixed
			 */
			public function call( string $method, ...$args ) {
				return $this->$method( ...$args );
			}
		};
	}

	/**
	 * The SVG the helper draws for an icon, as a place should contain it.
	 *
	 * @param string $value A `set:name` value.
	 * @param string $class The place's own class, if it adds one.
	 * @param int    $size  The size it asks for.
	 *
	 * @return string
	 */
	private static function svg( string $value, string $class = '', int $size = 20 ): string {
		$svg = Format::icon( $value, array_filter( [ 'class' => $class, 'size' => 20 === $size ? null : $size ] ) );

		self::assertStringStartsWith( '<svg', $svg, $value . ' is not an icon the kit has.' );

		return $svg;
	}

	/**
	 * The helper reads both forms, and nothing else.
	 */
	public function test_the_helper_reads_a_set_value_and_a_dashicons_name(): void {
		$this->assertStringStartsWith( '<svg width="20" height="20" class="sugarcommerce-icon x"', Format::icon( 'heroicons-outline:key', [ 'class' => 'x' ] ) );
		$this->assertSame( '<span class="dashicons dashicons-admin-network sugarcommerce-icon" aria-hidden="true"></span>', Format::icon( 'admin-network' ) );
		$this->assertSame( Format::icon( 'admin-network' ), Format::icon( 'dashicons-admin-network' ) );

		$this->assertSame( '', Format::icon( 'heroicons-outline:no-such-icon' ) );
		$this->assertSame( '', Format::icon( '<b>' ) );
		$this->assertSame( '', Format::icon( '' ) );
	}

	/**
	 * A section's icon in the sidebar: either form, the class it is sized by
	 * either way.
	 */
	public function test_a_sidebar_section_takes_either_form(): void {
		$report = $this->report(
			[
				'layout' => 'sidebar',
				'tabs'   => [
					'licences' => [ 'label' => 'Licences', 'icon' => 'heroicons-outline:key' ],
					'sales'    => [ 'label' => 'Sales', 'icon' => 'dashicons-chart-bar' ],
					'refunds'  => [ 'label' => 'Refunds', 'icon' => 'undo' ],
				],
			]
		);

		$html = $report->capture( 'render_sidebar', 'licences' );

		$this->assertStringContainsString( self::svg( 'heroicons-outline:key', 'reports-sidebar-icon' ) . '<span class="reports-sidebar-label">Licences</span>', $html );
		$this->assertStringContainsString( '<span class="dashicons dashicons-chart-bar sugarcommerce-icon reports-sidebar-icon" aria-hidden="true"></span><span class="reports-sidebar-label">Sales</span>', $html );
		$this->assertStringContainsString( '<span class="dashicons dashicons-undo sugarcommerce-icon reports-sidebar-icon" aria-hidden="true"></span><span class="reports-sidebar-label">Refunds</span>', $html );
	}

	/**
	 * An icon that is not one keeps the space of one, as a section with none
	 * does, rather than drawing a span with a broken class.
	 */
	public function test_a_sidebar_icon_that_is_not_one_keeps_the_space(): void {
		$report = $this->report(
			[
				'layout' => 'sidebar',
				'tabs'   => [
					'sales'   => [ 'label' => 'Sales', 'icon' => 'heroicons-outline:key' ],
					'refunds' => [ 'label' => 'Refunds', 'icon' => 'heroicons-outline:no-such-icon' ],
				],
			]
		);

		$html = $report->capture( 'render_sidebar', 'sales' );

		$this->assertStringContainsString( '<span class="reports-sidebar-icon reports-sidebar-icon--none" aria-hidden="true"></span><span class="reports-sidebar-label">Refunds</span>', $html );
		$this->assertStringNotContainsString( 'no-such-icon', $html );
	}

	/**
	 * A tile's icon: either form, in its box.
	 */
	public function test_a_tile_takes_either_form(): void {
		$report = $this->report();

		$hero = $report->capture( 'render_tile', 'issued', [ 'title' => 'Issued', 'icon' => 'heroicons-outline:key' ] );
		$dash = $report->capture( 'render_tile', 'issued', [ 'title' => 'Issued', 'icon' => 'admin-network' ] );
		$none = $report->capture( 'render_tile', 'issued', [ 'title' => 'Issued' ] );

		$this->assertMatchesRegularExpression( '{<span class="reports-tile-icon icon-gray">\s*' . preg_quote( self::svg( 'heroicons-outline:key' ), '{' ) . '\s*</span>}', $hero );
		$this->assertMatchesRegularExpression( '{<span class="reports-tile-icon icon-gray">\s*<span class="dashicons dashicons-admin-network sugarcommerce-icon" aria-hidden="true"></span>\s*</span>}', $dash );
		$this->assertStringNotContainsString( 'reports-tile-icon', $none, 'A tile drawn with no icon has no empty box.' );
	}

	/**
	 * A tile that names no icon gets the chart, as a Heroicon -- in a group
	 * and on its own.
	 */
	public function test_a_tiles_default_icon_is_a_heroicon(): void {
		$this->assertSame( 'heroicons-outline:chart-bar', Format::TILE_ICON );

		$report = $this->report( [ 'components' => [ 'sales' => [ 'type' => 'tile' ] ] ] );
		$group  = $report->capture( 'render_tiles_group', 'row', [ 'tiles' => [ 'sales' => [ 'title' => 'Sales' ] ] ] );

		$this->assertSame( Format::TILE_ICON, $report->call( 'apply_component_type_defaults', [ 'type' => 'tile' ] )['icon'] );
		$this->assertStringContainsString( self::svg( Format::TILE_ICON ), $group );
		$this->assertStringNotContainsString( 'dashicons', $group );
	}

	/**
	 * The arrow beside a tile's change, one for each way it went.
	 */
	public function test_a_tiles_change_is_drawn_with_a_heroicon_arrow(): void {
		$report = $this->report();
		$draw   = static fn( int $value, int $previous ): string => $report->capture(
			'render_tile',
			'sales',
			[
				'title'         => 'Sales',
				'data_callback' => static fn(): array => [ 'value' => $value, 'previous_value' => $previous ],
			]
		);

		$up      = $draw( 12, 10 );
		$down    = $draw( 8, 10 );
		$neutral = $draw( 10, 10 );

		$this->assertMatchesRegularExpression( '{<div class="reports-tile-change change-up">\s*' . preg_quote( self::svg( 'heroicons-outline:arrow-up' ), '{' ) . '}', $up );
		$this->assertMatchesRegularExpression( '{<div class="reports-tile-change change-down">\s*' . preg_quote( self::svg( 'heroicons-outline:arrow-down' ), '{' ) . '}', $down );
		$this->assertMatchesRegularExpression( '{<div class="reports-tile-change change-neutral">\s*' . preg_quote( self::svg( 'heroicons-outline:minus' ), '{' ) . '}', $neutral );

		foreach ( [ $up, $down, $neutral ] as $html ) {
			$this->assertStringNotContainsString( 'dashicons', $html );
		}
	}

	/**
	 * A chart's headline carries the same arrows, and an unknown direction
	 * is level.
	 */
	public function test_a_headline_change_is_drawn_with_a_heroicon_arrow(): void {
		$report = $this->report();

		$this->assertStringContainsString(
			'<div class="reports-tile-change change-down">' . self::svg( 'heroicons-outline:arrow-down' ) . '12%</div>',
			$report->call( 'headline_markup', [ 'value' => '1', 'change' => '12%', 'direction' => 'down' ] )
		);
		$this->assertStringContainsString(
			'<div class="reports-tile-change change-neutral">' . self::svg( 'heroicons-outline:minus' ) . '0%</div>',
			$report->call( 'headline_markup', [ 'value' => '1', 'change' => '0%', 'direction' => 'sideways' ] )
		);
	}

	/**
	 * The script is handed the same three arrows, so a refreshed tile
	 * shows the arrow the page was drawn with.
	 */
	public function test_the_script_is_handed_the_change_arrows(): void {
		$this->report()->call( 'localize_scripts' );

		$config = $GLOBALS['rr_localized'][ Runtime::handle() ] ?? [];

		$this->assertSame(
			[
				'up'      => self::svg( 'heroicons-outline:arrow-up' ),
				'down'    => self::svg( 'heroicons-outline:arrow-down' ),
				'neutral' => self::svg( 'heroicons-outline:minus' ),
			],
			$config['changeIcons'] ?? null
		);
	}

	/**
	 * The configuration is published under this copy's script handle.
	 *
	 * Two Strauss-prefixed copies each load their own reports.js, and the
	 * script finds its entry by the id WordPress stamps on its tag: a shared
	 * global would leave whichever localized last serving both.
	 */
	public function test_the_configuration_is_keyed_by_the_script_handle(): void {
		$GLOBALS['rr_inline'] = [];

		$this->report()->call( 'localize_scripts' );

		[ $position, $script ] = $GLOBALS['rr_inline'][ Runtime::handle() ][0] ?? [ '', '' ];

		$this->assertSame( 'before', $position );
		$this->assertStringStartsWith(
			'window.SugarCommerceReports=window.SugarCommerceReports||{};window.SugarCommerceReports["' . Runtime::handle() . '"]=',
			$script
		);
	}

	/**
	 * The library's own: the caret, the calendar and the empty screen.
	 */
	public function test_the_librarys_own_icons_are_heroicons(): void {
		$report = $this->report();

		$picker = $report->capture( 'render_date_picker' );
		$empty  = $report->capture( 'render_empty_state' );

		$this->assertStringContainsString( self::svg( 'heroicons-outline:chevron-down' ), $picker );
		$this->assertStringNotContainsString( 'dashicons', $picker );

		$this->assertStringContainsString( '<span class="reports-empty-state-icon">' . self::svg( 'heroicons-outline:chart-bar' ) . '</span>', $empty );
		$this->assertStringNotContainsString( 'dashicons', $empty );
	}

	/**
	 * The calendar beside the period the exports cover.
	 */
	public function test_the_export_period_has_a_heroicon_calendar(): void {
		$report = $this->report()->with_range( [ 'preset' => 'this_month', 'start' => '2026-08-01', 'end' => '2026-08-31' ] );
		$html   = $report->capture(
			'render_exports_section',
			[
				'orders' => [
					'title'       => 'Orders',
					'show_period' => true,
					'headers'     => [ 'id' => 'ID' ],
				],
			]
		);

		$this->assertMatchesRegularExpression( '{<p class="reports-export-period">\s*' . preg_quote( self::svg( 'heroicons-outline:calendar' ), '{' ) . '}', $html );
		$this->assertStringNotContainsString( 'dashicons', $html );
	}

	/**
	 * A row can name an icon instead of giving a picture's URL, and it is
	 * drawn at the picture's size, with the picture's class.
	 */
	public function test_a_row_can_name_an_icon(): void {
		$report = $this->report();
		$html   = $report->capture(
			'render_breakdown_rows',
			[
				[ 'label' => 'Japan', 'value' => 2, 'icon' => 'heroicons-outline:globe-asia-australia' ],
				[ 'label' => 'Germany', 'value' => 1, 'icon' => 'https://example.test/flags/de.svg' ],
			],
			[]
		);

		$this->assertStringContainsString( '<span class="reports-breakdown-label">' . self::svg( 'heroicons-outline:globe-asia-australia', 'reports-row-icon', 16 ) . 'Japan</span>', $html );
		$this->assertStringContainsString( '<img class="reports-row-icon" src="https://example.test/flags/de.svg"', $html, 'A URL is the picture it always was.' );
		$this->assertStringStartsWith( '<svg width="16" height="16"', Format::row_glyph( 'heroicons-outline:globe-asia-australia' ) );

		// A bare word is a relative address in a row, not a Dashicon.
		$this->assertSame( '', Format::row_glyph( 'flag' ) );
		$this->assertSame( '', Format::row_glyph( 'https://example.test/flags/de.svg' ) );
	}

	/**
	 * A refresh sends the row's icon already drawn, and no URL for it.
	 */
	public function test_a_rows_named_icon_is_sent_drawn(): void {
		new Reports(
			'takings',
			[
				'tabs'       => [ 'main' => [ 'label' => 'Main' ] ],
				'components' => [
					'countries' => [
						'type'          => 'breakdown',
						'tab'           => 'main',
						'data_callback' => static fn(): array => [
							'rows' => [
								[ 'label' => 'Japan', 'value' => 2, 'icon' => 'heroicons-outline:globe-asia-australia' ],
								[ 'label' => 'Germany', 'value' => 1, 'icon' => 'https://example.test/flags/de.svg' ],
							],
						],
					],
					'glance'    => [
						'type'          => 'stat_list',
						'tab'           => 'main',
						'data_callback' => static fn(): array => [
							'rows' => [
								[ 'label' => 'Top country', 'value' => 'Japan', 'format' => 'text', 'icon' => 'heroicons-outline:globe-asia-australia' ],
							],
						],
					],
				],
			]
		);

		$request = new WP_REST_Request( 'GET', '/' );
		$request->set_param( 'report_id', 'takings' );
		$request->set_param( 'tab', 'main' );

		$components = RestApi::get_all_components_data( $request )->get_data()['components'];
		$glyph      = self::svg( 'heroicons-outline:globe-asia-australia', 'reports-row-icon', 16 );

		$this->assertSame( $glyph, $components['countries']['rows'][0]['icon_html'] ?? null );
		$this->assertSame( '', $components['countries']['rows'][1]['icon_html'] ?? null );
		$this->assertSame( 'https://example.test/flags/de.svg', $components['countries']['rows'][1]['icon'] ?? null );
		$this->assertSame( $glyph, $components['glance']['rows'][0]['icon_html'] ?? null );
	}
}
