<?php
/**
 * Built script tests.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;
use SugarCommerce\Plugin\Assets;

/**
 * The script is built from src/js into assets/build, and the build is
 * committed: Composer and Strauss copy a package as it is, with nothing run
 * at install. These keep the build and the PHP that loads it in step.
 */
final class ScriptsTest extends TestCase {

	/**
	 * Every entry the PHP loads.
	 */
	private const ENTRIES = [ 'reports' ];

	/**
	 * A file of the package, for the asset helper to find it from.
	 */
	private const FILE = __DIR__ . '/../src/Traits/AssetManager.php';

	/**
	 * Every entry is built, with the manifest @wordpress/scripts writes
	 * beside it, and none of them needs jQuery.
	 */
	public function test_every_built_entry_has_its_manifest(): void {
		foreach ( self::ENTRIES as $entry ) {
			$manifest = Assets::built_manifest( self::FILE, $entry );

			$this->assertNotNull( $manifest, $entry );
			$this->assertFileExists( dirname( __DIR__ ) . '/assets/build/' . $entry . '.js', $entry );
			$this->assertSame( [], preg_grep( '/^jquery/', $manifest['dependencies'] ), $entry );
			$this->assertContains( 'wp-dom-ready', $manifest['dependencies'], $entry );
			$this->assertMatchesRegularExpression( '/^[a-f0-9]{20}$/', (string) $manifest['version'], $entry );
		}

		$this->assertNull( Assets::built_manifest( self::FILE, 'nothing' ) );
	}

	/**
	 * Chart.js is in the build, at the version the vendored file was, not a
	 * script of its own that WordPress is asked for.
	 */
	public function test_chart_js_is_bundled(): void {
		$build = (string) file_get_contents( dirname( __DIR__ ) . '/assets/build/reports.js' );

		// Chart.js's own version, which the build keeps as `Chart.version`.
		$this->assertStringContainsString( 'static version="4.6.1"', $build );
		$this->assertSame( [ 'wp-api-fetch', 'wp-dom-ready' ], Assets::built_manifest( self::FILE, 'reports' )['dependencies'] );
	}

	/**
	 * The report's screen loads the build, under the copy's handle -- the
	 * one its settings are published under -- in the footer.
	 */
	public function test_the_screen_loads_the_build_under_its_handle(): void {
		$source = (string) file_get_contents( self::FILE );

		$this->assertStringContainsString( "Assets::enqueue_built_script( Runtime::handle(), __FILE__, 'reports' );", $source );
		$this->assertStringContainsString( 'wp_localize_script( $handle, Runtime::js_object( \'Admin\' ), $config );', $source );
		$this->assertStringContainsString( '$handle = Runtime::handle();', $source );
	}

	/**
	 * The sources ship beside the build, and nothing loads a script from
	 * the old hand-written folder.
	 */
	public function test_nothing_loads_the_old_scripts(): void {
		$this->assertDirectoryDoesNotExist( dirname( __DIR__ ) . '/assets/js' );
		$this->assertFileExists( dirname( __DIR__ ) . '/src/js/reports.js' );

		foreach ( glob( dirname( __DIR__ ) . '/src/{,*/,*/*/}*.php', GLOB_BRACE ) as $file ) {
			$this->assertStringNotContainsString( "'js/", (string) file_get_contents( $file ), basename( $file ) );
		}
	}
}
