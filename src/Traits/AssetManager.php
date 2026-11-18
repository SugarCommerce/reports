<?php
/**
 * Asset Manager Trait
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits;

use SugarCommerce\Fields\Assets as FieldAssets;
use SugarCommerce\Plugin\Assets;
use SugarCommerce\Reports\Format;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Utils\Runtime;

/**
 * Trait AssetManager
 *
 * Enqueues the report's stylesheet, Chart.js and its script, from wherever
 * the package was installed.
 */
trait AssetManager {

	/**
	 * Maybe enqueue assets on the reports page.
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 *
	 * @return void
	 */
	public function maybe_enqueue_assets( string $hook_suffix ): void {
		if ( $hook_suffix !== $this->hook_suffix ) {
			return;
		}

		$this->enqueue_assets();
	}

	/**
	 * Enqueue all required assets.
	 *
	 * @return void
	 */
	protected function enqueue_assets(): void {
		$this->enqueue_core_assets();
		$this->localize_scripts();
	}

	/**
	 * Enqueue the stylesheet and the scripts.
	 *
	 * @return void
	 */
	protected function enqueue_core_assets(): void {
		// The kit's, because the header is the kit's. Without it the markup
		// renders and none of the rules for it load, so the header falls back
		// to core's .privacy-settings-header and the tabs stack one per line.
		( new FieldAssets() )->enqueue();

		Assets::enqueue_style(
			Runtime::handle(),
			__FILE__,
			'css/reports.css'
		);

		Assets::enqueue_script(
			Runtime::handle( 'chartjs' ),
			__FILE__,
			'js/chart.js',
			[]
		);

		Assets::enqueue_script(
			Runtime::handle(),
			__FILE__,
			'js/reports.js',
			// wp-api-fetch carries the REST requests, so a nonce that ran
			// out while the report was open is renewed, not answered 403.
			[ 'jquery', 'wp-api-fetch', Runtime::handle( 'chartjs' ) ]
		);
	}

	/**
	 * Localize scripts with necessary data.
	 *
	 * @return void
	 */
	protected function localize_scripts(): void {
		$config = [
			'restUrl'       => rest_url( RestApi::rest_namespace() . '/' ),
			'restNonce'     => wp_create_nonce( 'wp_rest' ),
			'reportId'      => $this->id,

			// The preset a request with no date_preset means. The script had
			// its own idea of this and so did PHP, so a report configuring a
			// different default got it on the first render and lost it on the
			// first refresh.
			'defaultPreset' => (string) ( $this->config['default_preset'] ?? 'this_month' ),
			'i18n'          => [
				// General
				'loading'        => __( 'Loading...', 'sugarcommerce' ),
				'error'          => __( 'Error', 'sugarcommerce' ),
				'noData'         => __( 'No data available', 'sugarcommerce' ),
				'noChartData'    => __( 'Nothing to chart for this period yet.', 'sugarcommerce' ),

				// Export
				'exporting'      => __( 'Exporting...', 'sugarcommerce' ),
				'preparing'      => __( 'Preparing export...', 'sugarcommerce' ),
				/* translators: 1: number of rows processed so far, 2: total rows */
				'processing'     => __( 'Processing %1$d / %2$d', 'sugarcommerce' ),
				'complete'       => __( 'Export complete!', 'sugarcommerce' ),
				'download'       => __( 'Download CSV', 'sugarcommerce' ),
				'exportFailed'   => __( 'Export failed', 'sugarcommerce' ),
				'batchFailed'    => __( 'Batch failed', 'sugarcommerce' ),

				// Refresh / Last Updated
				'updatedJustNow' => __( 'Updated just now', 'sugarcommerce' ),
				/* translators: %d: number of seconds since the last refresh */
				'updatedSeconds' => __( 'Updated %ds ago', 'sugarcommerce' ),
				/* translators: %d: number of minutes since the last refresh */
				'updatedMinutes' => __( 'Updated %dm ago', 'sugarcommerce' ),
				/* translators: %d: number of hours since the last refresh */
				'updatedHours'   => __( 'Updated %dh ago', 'sugarcommerce' ),

				// Table Pagination
				/* translators: 1: first row on this page, 2: last row on this page, 3: total rows */
				'showing'        => __( 'Showing %1$d-%2$d of %3$d', 'sugarcommerce' ),
			],
			// The arrow a refreshed tile shows beside its change, drawn here
			// so the script inserts the markup the page was drawn with
			// rather than keeping its own idea of what an icon is.
			'changeIcons'   => [
				'up'      => Format::change_icon( 'up' ),
				'down'    => Format::change_icon( 'down' ),
				'neutral' => Format::change_icon( 'neutral' ),
			],
			'chartDefaults' => [
				'colors' => [
					'#3b82f6', // blue
					'#10b981', // emerald
					'#f59e0b', // amber
					'#ef4444', // red
					'#8b5cf6', // violet
					'#ec4899', // pink
					'#06b6d4', // cyan
					'#84cc16', // lime
				],
			],
		];

		$handle = Runtime::handle();

		// Published into a registry keyed by script handle rather than to a
		// bare global. Two Strauss-prefixed copies of this library each load
		// their own reports.js under their own handle, and a shared global
		// would leave whichever localized last serving both — with one
		// plugin's REST namespace, nonce and report id. The script resolves
		// its own entry from the id WordPress stamps on its <script> tag.
		wp_localize_script( $handle, Runtime::js_object( 'Admin' ), $config );

		wp_add_inline_script(
			$handle,
			sprintf(
				'window.SugarCommerceReports=window.SugarCommerceReports||{};window.SugarCommerceReports[%s]=%s;',
				wp_json_encode( $handle ),
				wp_json_encode( $config )
			),
			'before'
		);
	}
}
