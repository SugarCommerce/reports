<?php
/**
 * Config Parser Trait
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits\Reports;

use SugarCommerce\Reports\Format;

/**
 * Trait ConfigParser
 *
 * Handles parsing and normalizing the configuration array.
 */
trait ConfigParser {

	/**
	 * Parse the configuration array.
	 *
	 * @return void
	 */
	protected function parse_config(): void {
		$this->parse_tabs();
		$this->parse_components();
		$this->parse_exports();
	}

	/**
	 * Where each tab sits, by key.
	 *
	 * Kept beside the tabs and not in them: a tab is handed back to whoever
	 * asks for it as it was written, and the place of one that named none is
	 * a fact about when it arrived, not something its author said.
	 *
	 * @var array<string, float>
	 */
	protected array $tab_positions = [];

	/**
	 * Parse tabs configuration.
	 *
	 * @return void
	 */
	protected function parse_tabs(): void {
		if ( empty( $this->config['tabs'] ) ) {
			// Create a default tab if components exist but no tabs defined
			if ( ! empty( $this->config['components'] ) ) {
				$this->tabs['default'] = [
					'label' => __( 'Overview', 'sugarcommerce' ),
				];
			}

			return;
		}

		foreach ( $this->config['tabs'] as $key => $tab ) {
			$this->set_tab( (string) $key, $tab );
		}

		$this->sort_tabs();
	}

	/**
	 * File one tab, in the shape the rest of the library reads.
	 *
	 * @param string       $key Tab key.
	 * @param array|string $tab Its configuration, or only its label.
	 *
	 * @return void
	 */
	protected function set_tab( string $key, $tab ): void {
		// Ten for each tab there has been, so the first is at 10, the second
		// at 20 and so on -- room between any two for a tab that asks to be
		// put there, without anybody having numbered the ones already here.
		// A tab replaced under its own key keeps the place it had.
		$position = $this->tab_positions[ $key ] ?? ( count( $this->tab_positions ) + 1 ) * 10;

		// Handle simple string format: 'overview' => 'Overview'
		if ( is_string( $tab ) ) {
			$this->tabs[ $key ] = [
				'label' => $tab,
				'icon'  => '',
			];
		} else {
			// Full array format
			$this->tabs[ $key ] = wp_parse_args( $tab, [
				'label'           => ucfirst( $key ),
				'icon'            => '',
				'render_callback' => null,
			] );

			if ( isset( $tab['position'] ) && is_numeric( $tab['position'] ) ) {
				$position = $tab['position'];
			}
		}

		$this->tab_positions[ $key ] = (float) $position;
	}

	/**
	 * Put the tabs in order of position.
	 *
	 * Two at the same position stay in the order they were registered.
	 *
	 * @return void
	 */
	protected function sort_tabs(): void {
		$positions = $this->tab_positions;

		uksort(
			$this->tabs,
			static fn( $a, $b ): int => ( $positions[ $a ] ?? 0 ) <=> ( $positions[ $b ] ?? 0 )
		);
	}

	/**
	 * Add a tab to a report that is already registered.
	 *
	 * For a plugin adding a section to somebody else's report. Fetch the
	 * report with Reports::get() and call this on a hook that runs on every
	 * request -- `init`, not `admin_menu`: the figures are fetched over REST,
	 * and a tab added only where the page is drawn is one whose components
	 * the REST request has never heard of.
	 *
	 * `position` places it among the others, which sit at 10, 20, 30 and so
	 * on unless they said otherwise; without one it goes last. `group` puts
	 * it under that heading in the sidebar layout.
	 *
	 * @param string       $key Tab key. An existing key replaces that tab.
	 * @param array|string $tab Its configuration, or only its label.
	 *
	 * @return static
	 */
	public function add_tab( string $key, $tab ): static {
		$this->set_tab( sanitize_key( $key ), $tab );
		$this->sort_tabs();

		return $this;
	}

	/**
	 * Add a component to a report that is already registered.
	 *
	 * The same shape a component has in the configuration, `tab` included.
	 * See add_tab() for when to call it.
	 *
	 * @param string $key       Component key. An existing key replaces it.
	 * @param array  $component Its configuration.
	 *
	 * @return static
	 */
	public function add_component( string $key, array $component ): static {
		$first_tab = ! empty( $this->tabs ) ? (string) array_key_first( $this->tabs ) : 'default';
		$component = $this->normalize_component( $key, $component, $first_tab );

		// A key is one component, wherever it used to be.
		foreach ( array_keys( $this->components ) as $tab ) {
			unset( $this->components[ $tab ][ $key ] );
		}

		$this->components[ $component['tab'] ][ $key ] = $component;

		return $this;
	}

	/**
	 * Add an export to a report that is already registered.
	 *
	 * @param string $key    Export key. An existing key replaces it.
	 * @param array  $export Its configuration.
	 *
	 * @return static
	 */
	public function add_export( string $key, array $export ): static {
		$first_tab = ! empty( $this->tabs ) ? (string) array_key_first( $this->tabs ) : 'default';
		$export    = $this->normalize_export( $key, $export, $first_tab );

		foreach ( array_keys( $this->exports ) as $tab ) {
			unset( $this->exports[ $tab ][ $key ] );
		}

		$this->exports[ $export['tab'] ][ $key ] = $export;

		return $this;
	}

	/**
	 * Parse components configuration.
	 *
	 * @return void
	 */
	protected function parse_components(): void {
		if ( empty( $this->config['components'] ) ) {
			$this->components = [];

			return;
		}

		$first_tab = ! empty( $this->tabs ) ? array_key_first( $this->tabs ) : 'default';

		foreach ( $this->config['components'] as $key => $component ) {
			$component = $this->normalize_component( $key, $component, $first_tab );
			$tab       = $component['tab'];

			if ( ! isset( $this->components[ $tab ] ) ) {
				$this->components[ $tab ] = [];
			}

			$this->components[ $tab ][ $key ] = $component;
		}
	}

	/**
	 * Normalize a single component configuration.
	 *
	 * @param string $key       Component key.
	 * @param array  $component Component configuration.
	 * @param string $first_tab First tab key for default.
	 *
	 * @return array
	 */
	protected function normalize_component( string $key, array $component, string $first_tab ): array {
		$defaults = [
			'type'          => 'tile',
			'title'         => ucfirst( str_replace( [ '_', '-' ], ' ', $key ) ),
			'description'   => '',
			'tab'           => $first_tab,
			'order'         => 10,
			'width'         => 'auto',      // auto, full, half, third, quarter
			'data_callback' => null,
			'class'         => '',
			'ajax_refresh'  => true,
		];

		$component = wp_parse_args( $component, $defaults );

		// Type-specific defaults
		$component = $this->apply_component_type_defaults( $component );

		return $component;
	}

	/**
	 * Apply type-specific default values to components.
	 *
	 * @param array $component Component configuration.
	 *
	 * @return array
	 */
	protected function apply_component_type_defaults( array $component ): array {
		switch ( $component['type'] ) {
			case 'tile':
				$component = wp_parse_args( $component, [
					'icon'         => Format::TILE_ICON,
					'value_format' => 'number',  // number, currency, percentage
				] );
				break;

			case 'chart':
				$component = wp_parse_args( $component, [
					'chart_type'      => 'line',  // line, bar, pie, doughnut, area, auto
					'height'          => 300,
					'show_legend'     => 'auto',  // auto: only for more than one dataset
					'legend_position' => 'top',
					'colors'          => [],
					'stacked'         => false,
					'fill'            => false,
					'tension'         => 0.4,
					'x_axis_label'    => '',
					'y_axis_label'    => '',
				] );
				break;

			case 'table':
				$component = wp_parse_args( $component, [
					'columns'       => [],
					'sortable'      => true,
					'paginated'     => true,
					'per_page'      => 10,
					'empty_message' => __( 'No data available.', 'sugarcommerce' ),
					'row_actions'   => [],
				] );
				break;

			case 'html':
				$component = wp_parse_args( $component, [
					'content'         => '',
					'render_callback' => null,
					'markup'          => true,
					'hide_when_empty' => false,
				] );
				break;

			case 'funnel':
				// Drawn with the page: its words are written in PHP, and
				// there is nothing in the script to redraw it with.
				$component['ajax_refresh'] = false;
				break;

			case 'tiles_group':
				$component = wp_parse_args( $component, [
					'tiles'   => [],
					'columns' => 4,
				] );
				break;
		}

		return $component;
	}

	/**
	 * Parse exports configuration.
	 *
	 * @return void
	 */
	protected function parse_exports(): void {
		if ( empty( $this->config['exports'] ) ) {
			$this->exports = [];

			return;
		}

		$first_tab = ! empty( $this->tabs ) ? array_key_first( $this->tabs ) : 'default';

		foreach ( $this->config['exports'] as $key => $export ) {
			$export = $this->normalize_export( $key, $export, $first_tab );
			$tab    = $export['tab'];

			if ( ! isset( $this->exports[ $tab ] ) ) {
				$this->exports[ $tab ] = [];
			}

			$this->exports[ $tab ][ $key ] = $export;
		}
	}

	/**
	 * Normalize a single export configuration.
	 *
	 * @param string $key       Export key.
	 * @param array  $export    Export configuration.
	 * @param string $first_tab First tab key for default.
	 *
	 * @return array
	 */
	protected function normalize_export( string $key, array $export, string $first_tab ): array {
		$defaults = [
			'title'         => ucfirst( str_replace( [ '_', '-' ], ' ', $key ) ),
			'description'   => '',
			'tab'           => $first_tab,
			'filename'      => $key,
			'data_callback' => null,
			// Required by RestApi::start_export(), which rejects an export
			// without one — listing it here so the shape an export must have
			// is visible in one place rather than only in the error.
			'total_callback' => null,
			'columns'       => [],
			'filters'       => [],
			'button_text'   => __( 'Export CSV', 'sugarcommerce' ),
		];

		return wp_parse_args( $export, $defaults );
	}

	/**
	 * Get components for a specific tab.
	 *
	 * @param string $tab Tab key.
	 *
	 * @return array
	 */
	protected function get_components_for_tab( string $tab ): array {
		$components = $this->components[ $tab ] ?? [];

		// Whatever this person turned off in Screen Options. Filtered here
		// rather than at render time so that everything downstream — the
		// grouping of tiles, the empty state, the REST payload — agrees
		// about what is on the page.
		$hidden = $this->hidden_components();

		if ( [] !== $hidden ) {
			$components = array_diff_key( $components, array_flip( $hidden ) );
		}

		// Sort by order
		uasort( $components, function ( $a, $b ) {
			return ( $a['order'] ?? 10 ) <=> ( $b['order'] ?? 10 );
		} );

		return $components;
	}

	/**
	 * Get exports for a specific tab.
	 *
	 * @param string $tab Tab key.
	 *
	 * @return array
	 */
	protected function get_exports_for_tab( string $tab ): array {
		return $this->exports[ $tab ] ?? [];
	}
}
