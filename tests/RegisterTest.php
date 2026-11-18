<?php
/**
 * Registering a report and finding it again.
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
 * `Reports::register()` and `Reports::get()` are the way in, in place of the
 * global functions a Strauss-prefixed copy could not share.
 */
final class RegisterTest extends TestCase {

	/**
	 * Forget what each test registered.
	 */
	protected function tearDown(): void {
		Registry::instance()->unregister( 'shop_reports' );
		unset( $GLOBALS['fk_filters'][ Runtime::hook( 'register' ) ] );
	}

	/**
	 * A registered report is found by its id.
	 */
	public function test_a_registered_report_is_found_by_its_id(): void {
		$report = Reports::register( 'shop_reports', [ 'tabs' => [ 'overview' => 'Overview' ] ] );

		$this->assertSame( $report, Reports::get( 'shop_reports' ) );
		$this->assertSame( 'shop_reports', $report->get_id() );
		$this->assertSame( 'shop_reports', $report->get_config( 'menu_slug' ) );
	}

	/**
	 * The id is a key, asked for either way.
	 */
	public function test_the_id_is_read_as_a_key(): void {
		Reports::register( 'Shop_Reports', [] );

		$this->assertNotNull( Reports::get( 'shop_reports' ) );
		$this->assertNotNull( Reports::get( 'Shop_Reports' ) );
	}

	/**
	 * A report nobody registered is null.
	 */
	public function test_an_unknown_report_is_null(): void {
		$this->assertNull( Reports::get( 'nobody_registered_this' ) );
	}
}
