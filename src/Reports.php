<?php
/**
 * Reports Main Class
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports;

use SugarCommerce\Reports\Traits\Reports\AssetManager;
use SugarCommerce\Reports\Traits\Reports\ComponentRenderer;
use SugarCommerce\Reports\Traits\Reports\ConfigParser;
use SugarCommerce\Reports\Traits\Reports\DateRangeHandler;
use SugarCommerce\Reports\Traits\Reports\ExportHandler;
use SugarCommerce\Reports\Traits\Reports\Layout;
use SugarCommerce\Reports\Traits\Reports\MenuBuilder;
use SugarCommerce\Reports\Traits\Reports\PageRenderer;
use SugarCommerce\Reports\Traits\Reports\ScreenOptions;
use SugarCommerce\Reports\Traits\Reports\TabManager;
use SugarCommerce\Reports\Utils\Runtime;

/**
 * Class Reports
 *
 * Main class for registering WordPress report pages.
 */
class Reports {

    use AssetManager;
    use ComponentRenderer;
    use ConfigParser;
    use DateRangeHandler;
    use ExportHandler;
    use Layout;
    use MenuBuilder;
    use PageRenderer;
    use ScreenOptions;
    use TabManager;

    /**
     * Unique identifier for this reports page.
     *
     * @var string
     */
    protected string $id;

    /**
     * Configuration array.
     *
     * @var array
     */
    protected array $config;

    /**
     * Parsed tabs array.
     *
     * @var array
     */
    protected array $tabs = [];

    /**
     * Parsed components array (organized by tab).
     *
     * @var array
     */
    protected array $components = [];

    /**
     * Parsed exports array.
     *
     * @var array
     */
    protected array $exports = [];

    /**
     * Reports page hook suffix.
     *
     * @var string
     */
    protected string $hook_suffix = '';

    /**
     * Current date range.
     *
     * @var array
     */
    protected array $date_range = [];

    /**
     * Default configuration values.
     *
     * @var array
     */
    protected array $defaults = [
		'page_title'       => 'Reports',
		'menu_title'       => 'Reports',
		'menu_slug'        => '',
		'capability'       => 'manage_options',
		'parent_slug'      => '',
		'icon'             => 'dashicons-chart-area',
		'position'         => null,
		'tabs'             => [],
		'components'       => [],
		'exports'          => [],
		'show_title'       => true,
		'show_tabs'        => true,
		'show_date_picker' => true,
		'body_class'       => '',

        // Where the sections are listed: 'tabs' across the top, 'sidebar'
        // down the left, or 'auto' -- tabs until there are more sections
        // than sidebar_after, and the sidebar from then on.
		'layout'           => 'auto',
		'sidebar_after'    => 6,

        // Branded header options
            'logo'             => '',
		'header_title'     => '',
		'header_class'     => '',

        // Date range options
            'date_presets'     => [],
		'default_preset'   => 'this_month',

        // Whose days a preset's are: 'utc' (midnight UTC, as always),
        // 'site' (the site's own midnight) or a DateTimeZone. And the day a
        // week starts on, 0 for Sunday to 6 for Saturday: null is Monday
        // for 'utc' and the site's own setting otherwise. start and end are
        // handed to callbacks in UTC whichever it is.
		'timezone'         => 'utc',
		'week_starts'      => null,

        // Refresh options
            'auto_refresh'     => 0,     // Seconds between auto-refresh. 0 = disabled
		'show_refresh'     => true,  // Show manual refresh button

        // Help screen options
		'help_tabs'        => [],
		'help_sidebar'     => '',
    ];

    /**
     * Constructor.
     *
     * @param string $id     Unique identifier for this reports page.
     * @param array  $config Configuration array.
     */
    public function __construct( string $id, array $config ) {
        $this->id = sanitize_key( $id );

        // Populate dynamic defaults before merging
        // Left empty: the picker then offers its own short list and a custom
        // range. Every preset the date library knows in the menu by default
        // is fifteen entries, most of them near-duplicates of a neighbour.
        $this->defaults['date_presets'] = [];

        /**
         * Filter a report's configuration as it is registered.
         *
         * How one plugin adds a tab, a component or an export to another's
         * report without that plugin having to offer a filter of its own.
         * Added before the report is registered; for one that already is,
         * see add_tab() and add_component().
         *
         * @param array  $config The configuration Reports::register() was handed.
         * @param string $id     The report's id.
         */
        $config = (array) apply_filters( Runtime::hook( 'register' ), $config, $this->id );

        $this->config = wp_parse_args( $config, $this->defaults );

        // Set defaults based on ID if not provided
        if ( empty( $this->config['menu_slug'] ) ) {
            $this->config['menu_slug'] = $this->id;
        }

        $this->parse_config();

        // Register with the central registry
        Registry::register( $this->id, $this );

        // Register REST API
        RestApi::register();

        $this->init_hooks();
    }

    /**
     * Register a reports page.
     *
     * The one way in: a plugin bundling this under a Strauss prefix calls
     * its own copy's class, so there is no global function for two copies
     * to fight over.
     *
     * @param string $id     Unique identifier.
     * @param array  $config Configuration array.
     *
     * @return Reports
     */
    public static function register( string $id, array $config ): Reports {
        return new self( $id, $config );
    }

    /**
     * A reports page that is already registered.
     *
     * @param string $id Reports ID.
     *
     * @return Reports|null
     */
    public static function get( string $id ): ?Reports {
        return Registry::instance()->get( sanitize_key( $id ) );
    }

    /**
     * Initialize WordPress hooks.
     *
     * @return void
     */
    protected function init_hooks(): void {
        add_action( 'admin_menu', [ $this, 'register_menu' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'maybe_enqueue_assets' ] );

        // Add body class for styling
        add_filter( 'admin_body_class', [ $this, 'add_body_class' ] );

        // Fix menu highlight for submenu pages
        if ( ! empty( $this->config['parent_slug'] ) ) {
            add_filter( 'parent_file', [ $this, 'fix_parent_menu_highlight' ] );
            add_filter( 'submenu_file', [ $this, 'fix_submenu_highlight' ] );
        }
    }

/**
     * Get current filter values from URL for a tab.
     *
     * @param string $tab Tab key.
     *
     * @return array
     */
    public function get_current_filters( string $tab ): array {
        $tab_filters = $this->filters_for( $tab );
        $values      = [];

        foreach ( $tab_filters as $filter_key => $filter ) {
            $param_name = 'filter_' . $filter_key;

            // The same reading the refresh gives them, so a multiselect's
            // list reaches the callback as a list on the first render too.
            // The helper sanitizes element-wise; the sniff cannot see into
            // a static method and has to be told.
            if ( isset( $_GET[ $param_name ] ) ) {
                $values[ $filter_key ] = RestApi::sanitize_filter_value( wp_unslash( $_GET[ $param_name ] ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
            } else {
                $values[ $filter_key ] = $filter['default'] ?? '';
            }
        }

        return $values;
    }

/**
     * Get the reports ID.
     *
     * @return string
     */
    public function get_id(): string {
        return $this->id;
    }

    /**
     * Get a specific config value.
     *
     * @param string $key     Config key.
     * @param mixed  $fallback Value returned when the key is absent.
     *
     * @return mixed
     */
    public function get_config( string $key, $fallback = null ) {
        return $this->config[ $key ] ?? $fallback;
    }

    /**
     * Get all tabs.
     *
     * @return array
     */
    public function get_tabs(): array {
        return $this->tabs;
    }

    /**
     * Get all components.
     *
     * @return array
     */
    public function get_components(): array {
        return $this->components;
    }

    /**
     * Get all exports.
     *
     * @return array
     */
    public function get_exports(): array {
        return $this->exports;
    }

    /**
     * Get the hook suffix.
     *
     * @return string
     */
    public function get_hook_suffix(): string {
        return $this->hook_suffix;
    }
}
