<?php
/**
 * Funnel, note and HTML component tests.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Traits\Reports\ComponentRenderer;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

/**
 * The components that are drawn once, with the page: a funnel, and HTML.
 *
 * Both share one rule worth more than the rest -- with nothing to say they
 * take no room. A card of noughts tells a shop with no baskets that it lost
 * every sale, and an empty box across the top of a tab is a broken screen.
 */
final class FunnelTest extends TestCase {

	protected function tearDown(): void {
		Registry::instance()->unregister( 'shop' );
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
	 * Draw a funnel whose callback returns what it is given.
	 *
	 * @param mixed $data      What the callback returns.
	 * @param array $component Configuration overrides.
	 *
	 * @return string
	 */
	private function funnel( mixed $data, array $component = [] ): string {
		return $this->renderer()->draw(
			'basket',
			$component + [
				'type'          => 'funnel',
				'title'         => 'From basket to order',
				'data_callback' => fn() => $data,
			]
		);
	}

	/**
	 * Three steps.
	 *
	 * @return array
	 */
	private static function steps(): array {
		return [
			[ 'label' => 'Baskets', 'count' => 200 ],
			[ 'label' => 'Checkouts', 'count' => 50, 'next' => '%s were paid for' ],
			[ 'label' => 'Orders', 'count' => 40 ],
		];
	}

	public function test_each_step_is_drawn_with_its_count(): void {
		$html = $this->funnel( self::steps() );

		$this->assertStringContainsString( '<h3 class="reports-chart-title">From basket to order</h3>', $html );
		$this->assertStringContainsString( '<span class="reports-funnel-label">Checkouts</span><strong>50</strong>', $html );
		$this->assertStringContainsString( '--reports-funnel-columns:3;', $html );
	}

	/**
	 * Each bar is its step against the first.
	 */
	public function test_each_bar_is_its_share_of_the_first_step(): void {
		$html = $this->funnel( self::steps() );

		$this->assertStringContainsString( 'style="width:100%"', $html );
		$this->assertStringContainsString( 'style="width:25%"', $html );
		$this->assertStringContainsString( 'style="width:20%"', $html );
	}

	/**
	 * Between each step and the next, the share that carried on -- in the
	 * step's own words when it has some.
	 */
	public function test_the_conversion_to_the_next_step_is_said(): void {
		$html = $this->funnel( self::steps() );

		$this->assertStringContainsString( '<span class="reports-funnel-next">25% continued</span>', $html );
		$this->assertStringContainsString( '<span class="reports-funnel-next">80% were paid for</span>', $html );
	}

	/**
	 * The last carries on to nothing, and says nothing unless told to.
	 */
	public function test_the_last_step_says_nothing_of_its_own(): void {
		$html = $this->funnel( self::steps() );

		$this->assertStringEndsWith( '<span class="reports-funnel-next"></span></li></ol></div>', trim( $html ) );
	}

	/**
	 * A note given is drawn as it is, in place of the worked-out share.
	 */
	public function test_a_note_is_drawn_as_given(): void {
		$steps            = self::steps();
		$steps[0]['note'] = '30% reached checkout <b>';

		$html = $this->funnel( $steps );

		$this->assertStringContainsString( '30% reached checkout &lt;b&gt;', $html );
		$this->assertStringNotContainsString( '25% continued', $html );
	}

	/**
	 * The figure is the whole way through unless the callback says
	 * otherwise.
	 */
	public function test_the_headline_is_the_whole_way_through(): void {
		$this->assertStringContainsString( '<div class="reports-tile-value">20%</div>', $this->funnel( self::steps() ) );

		$html = $this->funnel(
			[
				'steps'       => self::steps(),
				'headline'    => [ 'value' => '21%', 'change' => '3% vs previous period', 'direction' => 'up' ],
				'description' => 'Of 200 baskets, 40 were paid for.',
				'foot'        => [ '12 left at checkout', '', 'Average basket £30' ],
			]
		);

		$this->assertStringContainsString( '<div class="reports-tile-value">21%</div>', $html );
		$this->assertStringContainsString( 'change-up', $html );
		$this->assertStringContainsString( '<p class="reports-chart-description">Of 200 baskets, 40 were paid for.</p>', $html );
		$this->assertStringContainsString( '<p class="reports-funnel-foot">12 left at checkout · Average basket £30</p>', $html );
	}

	/**
	 * Nothing in the first step is nothing to draw.
	 */
	public function test_an_empty_funnel_draws_nothing(): void {
		$steps             = self::steps();
		$steps[0]['count'] = 0;

		$this->assertSame( '', trim( $this->funnel( $steps ) ) );
		$this->assertSame( '', trim( $this->funnel( [] ) ) );
		$this->assertSame( '', trim( $this->funnel( [ 'steps' => [] ] ) ) );
	}

	/**
	 * A colour is a colour, and nothing that could close the declaration.
	 */
	public function test_the_bar_colour_is_a_colour_or_nothing(): void {
		$this->assertStringContainsString( '--reports-funnel-fill:#3858e9;', $this->funnel( self::steps(), [ 'colour' => '#3858e9' ] ) );

		$html = $this->funnel( self::steps(), [ 'colour' => 'red;background:url(x)' ] );

		$this->assertStringNotContainsString( '--reports-funnel-fill', $html );
		$this->assertStringNotContainsString( 'url(x)', $html );
	}

	/**
	 * Labels are somebody's words and are escaped.
	 */
	public function test_a_label_is_escaped(): void {
		$html = $this->funnel( [ [ 'label' => '<script>', 'count' => 1 ] ] );

		$this->assertStringContainsString( '&lt;script&gt;', $html );
		$this->assertStringNotContainsString( '<script>', $html );
	}

	/**
	 * A sentence across the top of a tab, in a card of its own.
	 */
	public function test_a_note_is_a_sentence_in_a_card(): void {
		$html = $this->renderer()->draw(
			'when',
			[
				'type'       => 'html',
				'appearance' => 'note',
				'width'      => 'full',
				'markup'     => false,
				'content'    => fn( array $range ) => 'Post on ' . $range['start'] . ' <b>',
			]
		);

		$this->assertStringContainsString( 'class="reports-chart-wrapper reports-note reports-component--full"', $html );
		$this->assertStringContainsString( '<div class="reports-note-text">Post on 2026-08-01 &lt;b&gt;</div>', $html );
	}

	/**
	 * With nothing to say, it takes no room.
	 */
	public function test_an_empty_html_component_can_take_no_room(): void {
		$empty = [
			'type'            => 'html',
			'title'           => 'Nothing yet',
			'hide_when_empty' => true,
			'content'         => fn() => '  ',
		];

		$this->assertSame( '', $this->renderer()->draw( 'when', $empty ) );
		$this->assertSame( '', $this->renderer()->draw( 'when', [ 'appearance' => 'note' ] + $empty ) );

		$printed = [
			'type'            => 'html',
			'hide_when_empty' => true,
			'render_callback' => static function (): void {
				echo '';
			},
		];

		$this->assertSame( '', $this->renderer()->draw( 'when', $printed ) );
	}

	/**
	 * Without the flag the box is drawn, because an empty one is also what a
	 * script fills in later.
	 */
	public function test_an_empty_html_component_is_drawn_unless_asked(): void {
		$html = $this->renderer()->draw( 'mount', [ 'type' => 'html' ] );

		$this->assertStringContainsString( 'data-component-id="mount"', $html );
	}

	/**
	 * Markup is kept, and what is not markup is escaped.
	 */
	public function test_html_content_is_kept_or_escaped(): void {
		$markup = $this->renderer()->draw( 'a', [ 'type' => 'html', 'content' => '<strong>Yes</strong>' ] );
		$text   = $this->renderer()->draw( 'b', [ 'type' => 'html', 'content' => '<strong>No</strong>', 'markup' => false ] );

		$this->assertStringContainsString( '<strong>Yes</strong>', $markup );
		$this->assertStringContainsString( '&lt;strong&gt;No&lt;/strong&gt;', $text );
	}

	/**
	 * A component drawn once is not run again for a refresh nobody will
	 * draw: its callback is a query for nothing.
	 */
	public function test_a_funnel_is_not_refreshed(): void {
		$calls = 0;

		new Reports(
			'shop',
			[
				'components' => [
					'basket' => [
						'type'          => 'funnel',
						'data_callback' => static function () use ( &$calls ): array {
							++$calls;

							return self::steps();
						},
					],
					'sales'  => [
						'type'          => 'chart',
						'data_callback' => fn() => [ 'labels' => [], 'datasets' => [] ],
					],
				],
			]
		);

		$request = new WP_REST_Request( 'GET', '/' );
		$request->set_param( 'report_id', 'shop' );

		$data = RestApi::get_all_components_data( $request )->get_data();

		$this->assertSame( 0, $calls );
		$this->assertArrayNotHasKey( 'basket', $data['components'] ?? $data );
		$this->assertArrayHasKey( 'sales', $data['components'] ?? $data );
	}
}
