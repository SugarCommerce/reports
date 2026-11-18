<?php
/**
 * Whose days a report's presets are.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Dates\Preset;
use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

/**
 * "Today" on a report was midnight to midnight UTC wherever the site was.
 * A report can now say its days are the site's (`'timezone' => 'site'`), and
 * what it hands a callback is still UTC -- only where the day starts moves.
 * The screen and the REST routes resolve a period through the same method,
 * so a tile drawn with the page and the same tile refreshed agree.
 */
final class TimezoneTest extends TestCase {

	/**
	 * Put the site back in UTC.
	 */
	protected function tearDown(): void {
		Registry::instance()->unregister( 'takings' );

		unset( $GLOBALS['rr_timezone'], $GLOBALS['fk_options']['start_of_week'] );

		$_GET = [];
	}

	/**
	 * Today's range for a report configured a given way, read off the screen.
	 *
	 * @param array<string, mixed> $config Extra configuration.
	 *
	 * @return array<string, mixed>
	 */
	private function screen( array $config ): array {
		$report = new class( 'takings', $config + [ 'tabs' => [ 'main' => 'Main' ] ] ) extends Reports {

			/**
			 * @return array<string, mixed>
			 */
			public function range(): array {
				return $this->get_current_date_range();
			}
		};

		return $report->range();
	}

	/**
	 * Midnight today in a zone, as the UTC string a query is given.
	 *
	 * @param string $zone   A timezone.
	 * @param string $modify Moved by this much, on that zone's calendar.
	 *
	 * @return string
	 */
	private function midnight( string $zone, string $modify = 'today' ): string {
		return ( new DateTimeImmutable( 'now', new DateTimeZone( $zone ) ) )
			->modify( $modify )
			->setTime( 0, 0 )
			->setTimezone( new DateTimeZone( 'UTC' ) )
			->format( 'Y-m-d H:i:s' );
	}

	public function test_days_are_utc_unless_the_report_says_otherwise(): void {
		$GLOBALS['rr_timezone'] = 'Pacific/Auckland';
		$_GET['date_preset']    = 'today';

		$range = $this->screen( [] );

		$this->assertSame( $this->midnight( 'UTC' ), $range['start'] );
		$this->assertSame( '00:00:00', substr( $range['start'], 11 ) );
	}

	public function test_a_report_can_have_the_sites_days(): void {
		$GLOBALS['rr_timezone'] = 'Pacific/Auckland';
		$_GET['date_preset']    = 'today';

		$range = $this->screen( [ 'timezone' => 'site' ] );

		$this->assertSame( $this->midnight( 'Pacific/Auckland' ), $range['start'] );
		$this->assertSame( $this->midnight( 'Pacific/Auckland', 'tomorrow' ), $range['end'] );
		$this->assertNotSame( '00:00:00', substr( $range['start'], 11 ), 'handed over in UTC, where Auckland\'s midnight is not midnight' );
		$this->assertSame( 'today', $range['preset'] );
	}

	public function test_a_report_can_name_a_zone(): void {
		$_GET['date_preset'] = 'today';

		$range = $this->screen( [ 'timezone' => new DateTimeZone( 'America/New_York' ) ] );

		$this->assertSame( $this->midnight( 'America/New_York' ), $range['start'] );
	}

	public function test_two_picked_dates_are_the_sites_days(): void {
		$GLOBALS['rr_timezone'] = 'America/New_York';
		$_GET['date_preset']    = 'custom';
		$_GET['date_start']     = '2026-05-01';
		$_GET['date_end']       = '2026-05-31';

		$range = $this->screen( [ 'timezone' => 'site' ] );

		$this->assertSame( '2026-05-01 04:00:00', $range['start'] );
		$this->assertSame( '2026-06-01 04:00:00', $range['end'], 'the whole of the 31st there' );

		$this->assertSame( '2026-05-01 00:00:00', $this->screen( [] )['start'], 'and UTC\'s days for a report that did not ask' );
	}

	public function test_the_week_starts_on_the_sites_day_or_the_one_configured(): void {
		$GLOBALS['rr_timezone'] = 'America/New_York';

		// Options are read through wp-field-kit's stub, which keeps them here.
		$GLOBALS['fk_options']['start_of_week'] = 0;

		$start = static fn( array $config ): string => ( new DateTimeImmutable( Reports::resolve_range( 'this_week', '', '', $config )->start(), new DateTimeZone( 'UTC' ) ) )
			->setTimezone( new DateTimeZone( 'America/New_York' ) )
			->format( 'l H:i' );

		$this->assertSame( 'Sunday 00:00', $start( [ 'timezone' => 'site' ] ), 'the site\'s own setting' );
		$this->assertSame( 'Wednesday 00:00', $start( [ 'timezone' => 'site', 'week_starts' => 3 ] ), 'unless the report names a day' );

		// A report left in UTC keeps Monday whatever the site's week is.
		$this->assertSame( 'Monday', ( new DateTimeImmutable( Reports::resolve_range( 'this_week' )->start() ) )->format( 'l' ) );
		$this->assertSame( 'Saturday', ( new DateTimeImmutable( Reports::resolve_range( 'this_week', '', '', [ 'week_starts' => 6 ] )->start() ) )->format( 'l' ) );
	}

	public function test_a_refresh_over_rest_is_about_the_same_day_as_the_page(): void {
		$GLOBALS['rr_timezone'] = 'Pacific/Auckland';
		$_GET['date_preset']    = 'today';

		$seen = [];

		$config = [
			'timezone'   => 'site',
			'tabs'       => [ 'main' => 'Main' ],
			'components' => [
				'orders' => [
					'type'          => 'tile',
					'tab'           => 'main',
					'data_callback' => static function ( array $range ) use ( &$seen ): array {
						$seen = $range;

						return [ 'value' => 1 ];
					},
				],
			],
		];

		$page = $this->screen( $config );

		Registry::instance()->unregister( 'takings' );
		Registry::instance()->register( 'takings', new Reports( 'takings', $config ) );

		$request = new WP_REST_Request( 'GET', '/' );
		$request->set_param( 'report_id', 'takings' );
		$request->set_param( 'tab', 'main' );
		$request->set_param( 'date_preset', 'today' );

		RestApi::get_all_components_data( $request );

		$this->assertSame( $page['start'], $seen['start'] ?? null );
		$this->assertSame( $page['end'], $seen['end'] ?? null );
		$this->assertSame( $this->midnight( 'Pacific/Auckland' ), $seen['start'] ?? null );
	}
}
