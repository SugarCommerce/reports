<?php
/**
 * How the reports script reaches the REST API.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;

/**
 * The script's requests go through wp.apiFetch, which renews a nonce that ran
 * out while the report was open; tests/js/reports.js runs them.
 */
final class ApiFetchTest extends TestCase {

	public function test_the_script_needs_api_fetch(): void {
		$source = (string) file_get_contents( dirname( __DIR__ ) . '/src/Traits/AssetManager.php' );

		$this->assertMatchesRegularExpression( "#'js/reports\.js',(?:\s*//[^\n]*)*\s*\[[^\]]*'wp-api-fetch'#", $source );
	}

	public function test_no_request_sets_the_page_nonce_on_an_xhr_itself(): void {
		$script = (string) file_get_contents( dirname( __DIR__ ) . '/assets/js/reports.js' );

		// The one left is rest()'s fallback for a page without apiFetch.
		$this->assertSame( 1, substr_count( $script, "xhr.setRequestHeader('X-WP-Nonce'" ) );
	}
}
