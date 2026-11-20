<?php
/**
 * Security tests.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Utils\Runtime;
use WP_REST_Request;

/**
 * What an attacker would try against a report's routes.
 */
final class SecurityTest extends TestCase {

	/**
	 * Forget the user, the capabilities and the sessions.
	 */
	protected function tearDown(): void {
		unset( $GLOBALS['rp_caps'], $GLOBALS['rp_transients'], $GLOBALS['rp_user_id'] );

		Registry::instance()->unregister( 'takings' );
	}

	/**
	 * A request with these parameters.
	 *
	 * @param array<string, mixed> $params Parameters.
	 */
	private function request( array $params ): WP_REST_Request {
		$request = new WP_REST_Request( 'GET', '/' );

		foreach ( $params as $key => $value ) {
			$request->set_param( $key, $value );
		}

		return $request;
	}

	/**
	 * An export is its starter's: another user with the capability, handed
	 * the link, gets nothing.
	 *
	 * The download link carries the token in its query string, so it ends
	 * up in browser history and server logs. Anyone who could read the
	 * report could take the file with it.
	 */
	public function test_an_export_belongs_to_the_user_who_started_it(): void {
		new Reports( 'takings', [ 'capability' => 'view_takings', 'components' => [ 'total' => [ 'type' => 'tile' ] ] ] );

		set_transient( Runtime::key( 'export' ) . '_a-token', [ 'report_id' => 'takings', 'user_id' => 7 ] );

		$GLOBALS['rp_caps'] = [ 'view_takings' ];

		$GLOBALS['rp_user_id'] = 7;
		$this->assertTrue( RestApi::check_batch_permissions( $this->request( [ 'export_token' => 'a-token' ] ) ) );

		$GLOBALS['rp_user_id'] = 8;
		$refused               = RestApi::check_batch_permissions( $this->request( [ 'export_token' => 'a-token' ] ) );

		$this->assertInstanceOf( \WP_Error::class, $refused );
		$this->assertSame( 403, $refused->get_error_data()['status'] ?? null );
	}

	/**
	 * A failing callback's message stays on the server.
	 *
	 * It is the consumer's exception -- a database error with its query, a
	 * path, an API's reply -- and it went back to the browser as it was.
	 */
	public function test_a_failing_callback_does_not_say_why_to_the_browser(): void {
		new Reports(
			'takings',
			[
				'capability' => 'view_takings',
				'components' => [
					'total' => [
						'type'          => 'tile',
						'data_callback' => static function (): never {
							throw new RuntimeException( 'SQLSTATE[42S02] wp_secret_table' );
						},
					],
				],
			]
		);

		$answer = RestApi::get_component_data( $this->request( [ 'report_id' => 'takings', 'component_id' => 'total' ] ) );

		$this->assertInstanceOf( \WP_Error::class, $answer );
		$this->assertStringNotContainsString( 'wp_secret_table', $answer->get_error_message() );
		$this->assertSame( 500, $answer->get_error_data()['status'] ?? null );

		$all = RestApi::get_all_components_data( $this->request( [ 'report_id' => 'takings', 'tab' => '' ] ) );

		$this->assertStringNotContainsString( 'wp_secret_table', (string) wp_json_encode( $all ) );
	}
}
