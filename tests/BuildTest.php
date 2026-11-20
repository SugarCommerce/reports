<?php
/**
 * A report whose configuration is put together only when it is needed.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;
use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\Utils\Runtime;

/**
 * `build` is for a report whose filters and tabs cost something to work out:
 * registering it, and drawing the admin menu on every screen, must not pay.
 */
final class BuildTest extends TestCase {

	/**
	 * How many times the callback ran.
	 *
	 * @var int
	 */
	private int $built = 0;

	/**
	 * Forget what each test registered.
	 */
	protected function tearDown(): void {
		Registry::instance()->unregister( 'lazy_reports' );
		unset( $GLOBALS['fk_filters'][ Runtime::hook( 'register' ) ] );
	}

	/**
	 * A report with a build callback, counting its calls.
	 *
	 * @return Reports
	 */
	private function lazy(): Reports {
		return Reports::register(
			'lazy_reports',
			[
				'page_title'  => 'Shop reports',
				'menu_title'  => 'Reports',
				'parent_slug' => 'shop',
				'build'       => function (): array {
					++$this->built;

					return [
						'tabs'       => [
							'overview' => 'Overview',
							'products' => 'Products',
						],
						'components' => [
							'revenue' => [
								'type' => 'tile',
								'tab'  => 'products',
							],
						],
						'help_tabs'  => [ 'about' => [ 'title' => 'About' ] ],
					];
				},
			]
		);
	}

	/**
	 * Registering it, and everything the admin menu asks, builds nothing.
	 */
	public function test_registering_and_the_menu_do_not_build_it(): void {
		$report = $this->lazy();

		$report->add_tab( 'payouts', 'Payouts' );
		$report->fix_parent_menu_highlight( 'index.php' );
		$report->fix_submenu_highlight( null );

		$this->assertSame( 0, $this->built );
		$this->assertFalse( $report->is_built() );
		$this->assertSame( 'lazy_reports', Reports::get( 'lazy_reports' )?->get_id() );
	}

	/**
	 * The first question about its contents builds it, once.
	 */
	public function test_asking_for_its_contents_builds_it_once(): void {
		$report = $this->lazy();

		$this->assertSame( [ 'overview', 'products' ], array_keys( $report->get_tabs() ) );
		$this->assertArrayHasKey( 'revenue', $report->get_components()['products'] );
		$this->assertSame( 'Shop reports', $report->get_config( 'page_title' ) );
		$this->assertSame( 'lazy_reports', $report->get_config( 'menu_slug' ) );
		$this->assertTrue( $report->is_built() );
		$this->assertSame( 1, $this->built );
	}

	/**
	 * The registration filter sees the whole configuration, built.
	 */
	public function test_the_register_filter_sees_what_was_built(): void {
		add_filter(
			Runtime::hook( 'register' ),
			static function ( array $config ): array {
				$config['tabs']['payouts'] = 'Payouts';

				return $config;
			}
		);

		$report = $this->lazy();

		$this->assertSame( [ 'overview', 'products', 'payouts' ], array_keys( $report->get_tabs() ) );
	}

	/**
	 * A tab added before it was built is still there after.
	 */
	public function test_a_tab_added_before_the_build_survives_it(): void {
		$report = $this->lazy();

		$report->add_tab( 'payouts', 'Payouts' );

		$this->assertSame( [ 'overview', 'products', 'payouts' ], array_keys( $report->get_tabs() ) );
		$this->assertSame( 1, $this->built );
	}

	/**
	 * A report registered as a plain array is built at once, as before.
	 */
	public function test_a_plain_configuration_is_built_at_once(): void {
		$report = Reports::register( 'lazy_reports', [ 'tabs' => [ 'overview' => 'Overview' ] ] );

		$this->assertTrue( $report->is_built() );
		$this->assertSame( [ 'overview' ], array_keys( $report->get_tabs() ) );
	}
}
