<?php
/**
 * Layout tests: tabs across the top, or a sidebar.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\Utils\Runtime;
use PHPUnit\Framework\TestCase;

/**
 * A report counts its sections and decides where the list of them goes.
 *
 * The count is the point. A report is a screen other plugins add sections
 * to, so the layout that was right when it was written is not the one that
 * is right once three add-ons are installed -- and nobody goes back to
 * change a setting when they install the third. Six tabs fit across a
 * header; the seventh is where they stop fitting, and from there the list
 * goes down the side.
 *
 * What is pinned here is that the decision is made in one place and that
 * everything follows it: the class on the body, whether the header holds the
 * tabs, and whether the page is drawn as two columns.
 */
final class LayoutTest extends TestCase {

	protected function tearDown(): void {
		Registry::instance()->unregister( 'takings' );

		unset( $GLOBALS['fk_filters'][ Runtime::hook( 'register' ) ], $GLOBALS['rr_screen'] );

		$_GET = [];
	}

	/**
	 * A report with so many tabs, and its drawing reachable.
	 *
	 * @param int                  $count  How many tabs.
	 * @param array<string, mixed> $config Anything else to configure.
	 *
	 * @return Reports
	 */
	private function report( int $count, array $config = [] ): Reports {
		$tabs = [];

		for ( $i = 1; $i <= $count; $i++ ) {
			$tabs[ 'tab' . $i ] = [ 'label' => 'Tab ' . $i ];
		}

		return new class( 'takings', array_merge( [ 'tabs' => $tabs ], $config ) ) extends Reports {

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
			 * Say which admin screen this report is.
			 *
			 * @param string $hook_suffix The screen's id.
			 *
			 * @return void
			 */
			public function on_screen( string $hook_suffix ): void {
				$this->hook_suffix = $hook_suffix;
			}
		};
	}

	/**
	 * Six sections are tabs. That is today's screen, and it does not change.
	 */
	public function test_six_sections_are_tabs(): void {
		$this->assertSame( 'tabs', $this->report( 6 )->get_layout() );
	}

	/**
	 * The seventh moves them down the side.
	 */
	public function test_a_seventh_section_makes_a_sidebar(): void {
		$this->assertSame( 'sidebar', $this->report( 7 )->get_layout() );
	}

	/**
	 * Where it changes is a setting: the number of sections that still fit.
	 */
	public function test_the_threshold_is_configurable(): void {
		$this->assertSame( 'sidebar', $this->report( 4, [ 'sidebar_after' => 3 ] )->get_layout() );
		$this->assertSame( 'tabs', $this->report( 3, [ 'sidebar_after' => 3 ] )->get_layout() );
		$this->assertSame( 'tabs', $this->report( 9, [ 'sidebar_after' => 9 ] )->get_layout() );
	}

	/**
	 * Either can be forced, whatever the count.
	 */
	public function test_either_layout_can_be_forced(): void {
		$this->assertSame( 'tabs', $this->report( 12, [ 'layout' => 'tabs' ] )->get_layout() );
		$this->assertSame( 'sidebar', $this->report( 2, [ 'layout' => 'sidebar' ] )->get_layout() );
	}

	/**
	 * A layout nobody has heard of counts, as `auto` does.
	 *
	 * A misspelt setting is a report in the default layout, not one that
	 * fails to draw its navigation at all.
	 */
	public function test_an_unknown_layout_is_auto(): void {
		$this->assertSame( 'tabs', $this->report( 6, [ 'layout' => 'sidebr' ] )->get_layout() );
		$this->assertSame( 'sidebar', $this->report( 7, [ 'layout' => 'sidebr' ] )->get_layout() );
	}

	/**
	 * The body says which layout it is, and only on the report's own screen.
	 */
	public function test_the_body_class_names_the_layout(): void {
		$tabs = $this->report( 6 );
		$tabs->on_screen( 'toplevel_page_takings' );

		$GLOBALS['rr_screen'] = 'toplevel_page_takings';

		$this->assertStringContainsString( ' reports-layout--tabs', $tabs->add_body_class( '' ) );
		$this->assertStringNotContainsString( 'reports-layout--sidebar', $tabs->add_body_class( '' ) );

		$side = $this->report( 7 );
		$side->on_screen( 'toplevel_page_takings' );

		$this->assertStringContainsString( ' reports-layout--sidebar', $side->add_body_class( '' ) );

		$GLOBALS['rr_screen'] = 'dashboard';

		$this->assertSame( 'wp-admin', $side->add_body_class( 'wp-admin' ) );
	}

	/**
	 * As tabs, the page is what it always was: the tabs in the header and
	 * no second column.
	 */
	public function test_the_tabs_layout_keeps_the_tabs_in_the_header(): void {
		$html = $this->report( 6 )->capture( 'render_page' );

		$this->assertStringContainsString( 'field-kit__page-tabs', $html );
		$this->assertStringNotContainsString( 'reports-shell', $html );
		$this->assertStringNotContainsString( 'reports-sidebar', $html );
		$this->assertSame( 1, substr_count( $html, 'class="reports-controls-bar"' ) );
	}

	/**
	 * As a sidebar, the page is laid out like a list screen: an ordinary
	 * wrap with its title first, the controls under it, and then the list
	 * of sections beside the content.
	 */
	public function test_the_sidebar_layout_is_a_list_screen_with_two_columns(): void {
		$html = $this->report( 7 )->capture( 'render_page' );

		$this->assertStringNotContainsString( 'field-kit__page-tabs', $html );
		$this->assertStringNotContainsString( 'field-kit__page-header', $html );
		$this->assertSame( 1, substr_count( $html, '<nav ' ) );
		$this->assertSame( 1, substr_count( $html, 'class="reports-controls-bar"' ) );
		$this->assertSame( 1, substr_count( $html, '<h1 ' ) );

		$wrap     = strpos( $html, 'class="wrap reports-wrap reports-page"' );
		$title    = strpos( $html, '<h1 class="wp-heading-inline' );
		$rule     = strpos( $html, 'wp-header-end' );
		$controls = strpos( $html, 'class="reports-controls-bar"' );
		$shell    = strpos( $html, '<div class="reports-shell">' );
		$sidebar  = strpos( $html, '<nav class="reports-sidebar"' );
		$main     = strpos( $html, '<div class="reports-main">' );
		$content  = strpos( $html, 'class="reports-content"' );

		$this->assertNotFalse( $wrap );
		$this->assertTrue( $wrap < $title && $title < $rule && $rule < $controls );
		$this->assertTrue( $controls < $shell && $shell < $sidebar && $sidebar < $main && $main < $content );

		// Every element the page opened, it closed.
		$this->assertSame( substr_count( $html, '<div' ), substr_count( $html, '</div>' ) );
	}

	/**
	 * The title names the section, except on the first one.
	 */
	public function test_the_sidebar_title_names_the_section(): void {
		$report = $this->report( 7 );

		$this->assertStringNotContainsString( 'reports-page-title-section', $report->capture( 'render_page' ) );

		$keys        = array_keys( $report->get_tabs() );
		$_GET['tab'] = $keys[2];
		$html        = $report->capture( 'render_page' );
		unset( $_GET['tab'] );

		$this->assertStringContainsString( 'reports-page-title-section', $html );
		$this->assertSame( 1, substr_count( $html, '<h1 ' ) );
	}

	/**
	 * A report that hides its tabs has no sidebar either.
	 */
	public function test_hidden_tabs_are_hidden_in_either_layout(): void {
		$html = $this->report( 7, [ 'show_tabs' => false ] )->capture( 'render_page' );

		$this->assertStringNotContainsString( 'reports-sidebar', $html );
		$this->assertStringNotContainsString( 'reports-shell', $html );
		$this->assertSame( 1, substr_count( $html, 'class="reports-controls-bar"' ) );
	}

	/**
	 * The sidebar is a labelled nav of links, with the current one said to
	 * be the current one -- once.
	 */
	public function test_the_sidebar_marks_the_current_section(): void {
		$_GET['date_preset'] = 'last_30';

		$html = $this->report( 7 )->capture( 'render_sidebar', 'tab3' );

		$this->assertStringStartsWith( '<nav class="reports-sidebar" aria-label="Report sections">', $html );
		$this->assertSame( 7, substr_count( $html, '<a href=' ) );
		$this->assertSame( 1, substr_count( $html, 'aria-current="page"' ) );
		$this->assertMatchesRegularExpression(
			'/<a href="[^"]*tab=tab3[^"]*" class="reports-sidebar-link reports-sidebar-link--current" data-tab="tab3" aria-current="page">/',
			$html
		);

		// The period travels with the link, as it does from a tab.
		$this->assertSame( 7, substr_count( $html, 'date_preset=last_30' ) );
	}

	/**
	 * A section with an icon shows it, hidden from a screen reader; one
	 * without keeps the space, so the labels stay in a line.
	 */
	public function test_the_sidebar_draws_icons_where_there_are_any(): void {
		$report = $this->report(
			0,
			[
				'layout' => 'sidebar',
				'tabs'   => [
					'sales'   => [ 'label' => 'Sales', 'icon' => 'dashicons-chart-bar' ],
					'refunds' => [ 'label' => 'Refunds' ],
				],
			]
		);

		$html = $report->capture( 'render_sidebar', 'sales' );

		$this->assertStringContainsString( '<span class="dashicons dashicons-chart-bar sugarcommerce-icon reports-sidebar-icon" aria-hidden="true"></span><span class="reports-sidebar-label">Sales</span>', $html );
		$this->assertStringContainsString( '<span class="reports-sidebar-icon reports-sidebar-icon--none" aria-hidden="true"></span><span class="reports-sidebar-label">Refunds</span>', $html );

		// And where nothing has one there is no column for them.
		$this->assertStringNotContainsString( 'reports-sidebar-icon', $this->report( 7 )->capture( 'render_sidebar', 'tab1' ) );
	}

	/**
	 * Sections with a group sit under its heading, after the ones without,
	 * and the list says which heading names it.
	 */
	public function test_the_sidebar_groups_sections_under_headings(): void {
		$report = $this->report(
			0,
			[
				'layout' => 'sidebar',
				'tabs'   => [
					// A grouped one first: the ungrouped still lead.
					'payouts'    => [ 'label' => 'Payouts', 'group' => 'Add-ons' ],
					'sales'      => [ 'label' => 'Sales' ],
					'export'     => [ 'label' => 'Export' ],
					'affiliates' => [ 'label' => 'Affiliates', 'group' => 'Add-ons' ],
					'stock'      => [ 'label' => 'Stock', 'group' => 'Warehouse' ],
				],
			]
		);

		$html = $report->capture( 'render_sidebar', 'sales' );

		preg_match_all( '/<span class="reports-sidebar-label">([^<]+)<|<h2 [^>]*>([^<]+)</', $html, $found );

		$this->assertSame(
			[ 'Sales', 'Export', '[Add-ons]', 'Payouts', 'Affiliates', '[Warehouse]', 'Stock' ],
			array_map(
				static fn( string $label, string $heading ): string => '' !== $heading ? '[' . $heading . ']' : $label,
				$found[1],
				$found[2]
			)
		);

		$this->assertSame( 2, substr_count( $html, '<h2 class="reports-sidebar-heading"' ) );
		$this->assertStringContainsString(
			'<h2 class="reports-sidebar-heading" id="reports-sidebar-heading-takings-1">Add-ons</h2><ul class="reports-sidebar-list" aria-labelledby="reports-sidebar-heading-takings-1">',
			$html
		);

		// The ungrouped list has no heading to be named by.
		$this->assertStringContainsString( '<div class="reports-sidebar-group"><ul class="reports-sidebar-list">', $html );
	}

	/**
	 * A position places a tab among the others, which sit ten apart in the
	 * order they were written. Without one, nothing moves.
	 */
	public function test_tabs_are_ordered_by_position(): void {
		$this->assertSame(
			[ 'tab1', 'tab2', 'tab3' ],
			array_keys( $this->report( 3 )->get_tabs() )
		);

		$report = $this->report(
			0,
			[
				'tabs' => [
					'export'  => [ 'label' => 'Export', 'position' => 100 ],
					'sales'   => 'Sales',
					'refunds' => [ 'label' => 'Refunds' ],
					'first'   => [ 'label' => 'First', 'position' => 1 ],
					'between' => [ 'label' => 'Between', 'position' => 25 ],
				],
			]
		);

		// sales is the second written and refunds the third: 20 and 30.
		$this->assertSame( [ 'first', 'sales', 'between', 'refunds', 'export' ], array_keys( $report->get_tabs() ) );

		// The order is the tabs', so the sidebar and the tab bar agree on it.
		$html = $report->capture( 'render_sidebar', 'sales' );

		$this->assertTrue( strpos( $html, '>Between<' ) < strpos( $html, '>Refunds<' ) );
		$this->assertTrue( strpos( $html, '>Refunds<' ) < strpos( $html, '>Export<' ) );
	}

	/**
	 * A tab and its component, added to a registered report from outside,
	 * are there: in the list, on the page, and counted by the layout.
	 */
	public function test_a_tab_added_to_a_registered_report_appears(): void {
		$this->report( 6, [ 'tabs' => [ 'sales' => 'Sales', 'export' => [ 'label' => 'Export', 'position' => 100 ] ] ] );

		$report = Registry::instance()->get( 'takings' );

		$this->assertInstanceOf( Reports::class, $report );

		$report
			->add_tab( 'payouts', [ 'label' => 'Payouts', 'position' => 50 ] )
			->add_component( 'paid_out', [ 'type' => 'tile', 'tab' => 'payouts', 'title' => 'Paid out' ] )
			->add_export( 'payouts_csv', [ 'tab' => 'payouts', 'title' => 'Payouts' ] );

		$this->assertSame( [ 'sales', 'payouts', 'export' ], array_keys( $report->get_tabs() ) );
		$this->assertSame( 'Paid out', $report->get_components()['payouts']['paid_out']['title'] );

		// Normalized as one written in the configuration would have been.
		$this->assertSame( 'number', $report->get_components()['payouts']['paid_out']['value_format'] );
		$this->assertSame( 'Export CSV', $report->get_exports()['payouts']['payouts_csv']['button_text'] );

		$_GET['tab'] = 'payouts';

		$html = $report->capture( 'render_page' );

		$this->assertMatchesRegularExpression( '/<a[^>]*tab=payouts[^>]*>Payouts<\/a>/', $html );
		$this->assertStringContainsString( 'data-component-id="paid_out"', $html );
	}

	/**
	 * A component added under a key that exists replaces that component,
	 * wherever it was.
	 */
	public function test_an_added_component_replaces_one_of_the_same_key(): void {
		$report = $this->report( 2, [ 'components' => [ 'total' => [ 'type' => 'tile', 'tab' => 'tab1' ] ] ] );

		$report->add_component( 'total', [ 'type' => 'tile', 'tab' => 'tab2', 'title' => 'Moved' ] );

		$this->assertArrayNotHasKey( 'total', $report->get_components()['tab1'] );
		$this->assertSame( 'Moved', $report->get_components()['tab2']['total']['title'] );
	}

	/**
	 * Enough added tabs and the layout changes by itself, which is the
	 * reason there is a layout to change.
	 */
	public function test_added_tabs_count_towards_the_layout(): void {
		$report = $this->report( 6 );

		$this->assertSame( 'tabs', $report->get_layout() );

		$report->add_tab( 'payouts', 'Payouts' );

		$this->assertSame( 'sidebar', $report->get_layout() );
		$this->assertSame( 'payouts', array_key_last( $report->get_tabs() ) );
	}

	/**
	 * The configuration can be filtered as the report is registered, by a
	 * plugin that knows the report's id and nothing else about its owner.
	 */
	public function test_the_configuration_is_filtered_on_registration(): void {
		add_filter(
			Runtime::hook( 'register' ),
			static function ( array $config, string $id ): array {
				if ( 'takings' !== $id ) {
					return $config;
				}

				$config['tabs']['payouts']        = [ 'label' => 'Payouts' ];
				$config['components']['paid_out'] = [ 'type' => 'tile', 'tab' => 'payouts' ];

				return $config;
			},
			10,
			2
		);

		$report = $this->report( 2 );

		$this->assertSame( [ 'tab1', 'tab2', 'payouts' ], array_keys( $report->get_tabs() ) );
		$this->assertArrayHasKey( 'paid_out', $report->get_components()['payouts'] );
		$this->assertStringContainsString( '>Payouts</a>', $report->capture( 'render_page' ) );
	}
}
