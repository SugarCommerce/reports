<?php
/**
 * Handing over a finished export.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;
use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Utils\Runtime;
use WP_REST_Request;
use WP_REST_Response;

/**
 * The download reads a path out of a transient and streams it, so the path
 * is held to the report's own export folder rather than trusted.
 */
final class DownloadTest extends TestCase {

	/**
	 * A file written for the test, removed after it.
	 *
	 * @var string
	 */
	private string $file = '';

	/**
	 * Forget the report, the session and the file.
	 */
	protected function tearDown(): void {
		Registry::instance()->unregister( 'shop_reports' );
		$GLOBALS['rp_transients'] = [];

		if ( '' !== $this->file && is_file( $this->file ) ) {
			unlink( $this->file );
		}
	}

	/**
	 * Ask for the download of an export whose session names a file.
	 *
	 * @param string $path The file the session says was written.
	 *
	 * @return mixed
	 */
	private function download( string $path ) {
		Reports::register( 'shop_reports', [] );

		set_transient(
			Runtime::key( 'export' ) . '_token-1',
			[
				'report_id' => 'shop_reports',
				'export_id' => 'orders',
				'file_path' => $path,
				'filename'  => 'orders',
			]
		);

		$request = new WP_REST_Request( 'GET', '/' );
		$request->set_param( 'export_token', 'token-1' );

		return RestApi::handle_download_export( $request );
	}

	/**
	 * A file inside the export folder is handed over.
	 */
	public function test_a_file_in_the_export_folder_is_handed_over(): void {
		$this->file = Reports::register( 'shop_reports', [] )->get_export_path( 'token-1' );
		file_put_contents( $this->file, "a,b\n" );

		$this->assertInstanceOf( WP_REST_Response::class, $this->download( $this->file ) );
	}

	/**
	 * A file anywhere else is not, whatever the session says.
	 */
	public function test_a_file_outside_the_export_folder_is_refused(): void {
		$this->file = sys_get_temp_dir() . '/rp-outside-' . getmypid() . '.csv';
		file_put_contents( $this->file, "secret\n" );

		$result = $this->download( $this->file );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'export_file_missing', $result->get_error_code() );
	}

	/**
	 * Nor is a path that climbs out of it.
	 */
	public function test_a_path_that_climbs_out_is_refused(): void {
		$this->file = sys_get_temp_dir() . '/rp-climb-' . getmypid() . '.csv';
		file_put_contents( $this->file, "secret\n" );

		$dir    = Reports::register( 'shop_reports', [] )->get_export_dir();
		$result = $this->download( $dir . '/../../' . basename( $this->file ) );

		$this->assertTrue( is_wp_error( $result ) );
	}
}
