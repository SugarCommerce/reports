<?php
/**
 * REST API Class
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports;

use SugarCommerce\Dates\Site;
use SugarCommerce\Reports\Utils\Runtime;
use Throwable;
use WP_REST_Request;
use SugarCommerce\Reports\Traits\RestApi\ComponentData;
use SugarCommerce\Reports\Traits\RestApi\ExportEndpoints;
use SugarCommerce\Reports\Traits\RestApi\Permissions;
use SugarCommerce\Reports\Traits\RestApi\Preferences;
use SugarCommerce\Reports\Traits\RestApi\Routes;

/**
 * Class RestApi
 *
 * Handles REST API endpoints for reports including batched exports.
 */
class RestApi {

	use ComponentData;
	use ExportEndpoints;
	use Permissions;
	use Preferences;
	use Routes;

	/**
	 * Get the REST namespace for this build.
	 *
	 * Derived from the class namespace so two Strauss-prefixed copies of this
	 * library never register the same routes. See {@see Runtime}.
	 *
	 * @return string
	 */
	public static function rest_namespace(): string {
		return Runtime::rest_namespace();
	}

	/**
	 * What the browser is told when a consumer's callback throws.
	 *
	 * The exception is somebody else's -- a database error with its query, a
	 * path, an API's reply -- so its message is shown only where core shows
	 * errors, under WP_DEBUG with WP_DEBUG_DISPLAY on.
	 *
	 * @param Throwable $error What was thrown.
	 *
	 * @return string
	 */
	private static function failure( Throwable $error ): string {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY ) {
			return $error->getMessage();
		}

		return __( 'The report could not be read.', 'sugarcommerce' );
	}

	/**
	 * Get the transient key holding an export session.
	 *
	 * Prefixed per build so one plugin's copy cannot read, serve or delete
	 * another plugin's export session.
	 *
	 * @param string $export_token Export token.
	 *
	 * @return string
	 */
	private static function export_key( string $export_token ): string {
		return Runtime::key( 'export' ) . '_' . $export_token;
	}

	/**
	 * Whether the API has been registered.
	 */
	private static bool $registered = false;

	/**
	 * Rows an export writes per request, unless its config says
	 * `batch_size`.
	 */
	const BATCH_SIZE = 1000;

/**
	 * Get date range from request parameters.
	 *
	 * @param WP_REST_Request $request The REST request.
	 * @param Reports         $report  The report instance.
	 *
	 * @return array Date range with UTC and local representations.
	 */
	protected static function get_date_range_from_request( WP_REST_Request $request, Reports $report ): array {
		$preset     = $request->get_param( 'date_preset' );
		$date_start = $request->get_param( 'date_start' );
		$date_end   = $request->get_param( 'date_end' );

		// Use default preset if none specified
		if ( empty( $preset ) ) {
			$preset = $report->get_config( 'default_preset', 'this_month' );
		}

		// Resolved as the screen resolves it, in the timezone the report is
		// configured for: a tile loaded over REST and the same tile drawn
		// with the page must be about the same day.
		$range = Reports::resolve_range(
			(string) $preset,
			(string) ( $date_start ?? '' ),
			(string) ( $date_end ?? '' ),
			[
				'timezone'    => $report->get_config( 'timezone', 'utc' ),
				'week_starts' => $report->get_config( 'week_starts' ),
			]
		);

		return [
			'start'       => $range->start(),
			'end'         => $range->end(),
			'start_local' => Site::format( $range->start(), 'Y-m-d H:i:s' ),
			'end_local'   => Site::format( $range->end(), 'Y-m-d H:i:s' ),
			'preset'      => $preset,
		];
	}
}
