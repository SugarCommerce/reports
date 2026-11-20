<?php
/**
 * How the reports script reaches the REST API.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;
use SugarCommerce\Plugin\Assets;

/**
 * The script's requests go through wp.apiFetch, which renews a nonce that ran
 * out while the report was open; tests/js/rest.test.js and refresh.test.js
 * send them.
 */
final class ApiFetchTest extends TestCase {

	/**
	 * The build imports apiFetch, so its manifest makes it a dependency.
	 */
	public function test_the_script_needs_api_fetch(): void {
		$manifest = Assets::built_manifest( dirname( __DIR__ ) . '/src/Reports.php', 'reports' );

		$this->assertNotNull( $manifest );
		$this->assertContains( 'wp-api-fetch', $manifest['dependencies'] );
	}

	/**
	 * Nothing sends a request of its own: no xhr with the page's nonce set
	 * on it, no fetch(), no jQuery.
	 */
	public function test_no_request_goes_round_api_fetch(): void {
		$sources = '';

		foreach ( self::sources() as $file ) {
			$sources .= (string) file_get_contents( $file );
		}

		$this->assertStringNotContainsString( 'setRequestHeader', $sources );
		$this->assertStringNotContainsString( 'XMLHttpRequest', $sources );
		$this->assertDoesNotMatchRegularExpression( '/\bfetch\(/', $sources );
		$this->assertDoesNotMatchRegularExpression( '/\$\.ajax|\bjQuery\s*\(|window\.jQuery/', $sources );
		$this->assertSame( 1, preg_match_all( "#from '@wordpress/api-fetch'#", $sources ) );
	}

	/**
	 * Every script source.
	 *
	 * @return string[]
	 */
	private static function sources(): array {
		$files = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( dirname( __DIR__ ) . '/assets/js' ) );
		$paths = [];

		foreach ( $files as $file ) {
			if ( $file->isFile() && 'js' === $file->getExtension() ) {
				$paths[] = $file->getPathname();
			}
		}

		return $paths;
	}
}
