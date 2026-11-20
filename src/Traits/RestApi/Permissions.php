<?php
/**
 * REST Permissions
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits\RestApi;

use SugarCommerce\Reports\Registry;
use WP_Error;
use WP_REST_Request;

/**
 * Who is allowed to ask.
 *
 * The capability the report declared, not a hardcoded one — a report about
 * orders and a report about site health are not the same secret. Checked on
 * the endpoint rather than where the buttons are drawn: a page that hides a
 * control has hidden a control, not closed a route.
 */
trait Permissions {

	/**
	 * Check permissions for REST API access.
	 */
	public static function check_permissions( WP_REST_Request $request ) {
		$report_id = $request->get_param( 'report_id' );
		$report    = Registry::instance()->get( $report_id );

		if ( ! $report ) {
			return new WP_Error( 'invalid_report', __( 'Invalid report ID.', 'sugarcommerce' ), [ 'status' => 404 ] );
		}

		$capability = $report->get_config( 'capability', 'manage_options' );

		if ( ! current_user_can( $capability ) ) {
			return new WP_Error( 'rest_forbidden', __( 'Permission denied.', 'sugarcommerce' ), [ 'status' => 403 ] );
		}

		return true;
	}

	/**
	 * Check permissions for batch export requests.
	 */
	public static function check_batch_permissions( WP_REST_Request $request ) {
		$export_token = $request->get_param( 'export_token' );
		$config       = get_transient( self::export_key( $export_token ) );

		if ( ! $config ) {
			return new WP_Error( 'invalid_export', __( 'Export session expired.', 'sugarcommerce' ), [ 'status' => 400 ] );
		}

		$report = Registry::instance()->get( $config['report_id'] );

		if ( ! $report ) {
			return new WP_Error( 'invalid_report', __( 'Invalid report.', 'sugarcommerce' ), [ 'status' => 404 ] );
		}

		// An export is its starter's. The download link carries the token in
		// its query string, so it reaches browser history and server logs;
		// another user who can read the report must not take the file.
		if ( isset( $config['user_id'] ) && (int) $config['user_id'] !== get_current_user_id() ) {
			return new WP_Error( 'rest_forbidden', __( 'Permission denied.', 'sugarcommerce' ), [ 'status' => 403 ] );
		}

		$capability = $report->get_config( 'capability', 'manage_options' );

		return current_user_can( $capability ) ? true : new WP_Error( 'rest_forbidden', __( 'Permission denied.', 'sugarcommerce' ), [ 'status' => 403 ] );
	}
}
