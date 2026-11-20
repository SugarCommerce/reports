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
     * The configuration as it was registered, before any `build` callback.
     *
     * @var array
     */
    protected array $given = [];

    /**
     * What puts the rest of the configuration together, until it has.
     *
     * @var callable|null
     */
    protected $build = null;

    /**
     * Tabs, components and exports added before the build, to add after it.
     *
     * @var array<int, array{0: string, 1: array}>
     */
    protected array $pending = [];

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

        // Set defaults based on ID if not provided
        if ( empty( $config['menu_slug'] ) ) {
            $config['menu_slug'] = $this->id;
        }

        $build = $config['build'] ?? null;

        unset( $config['build'] );

        $this->given = $config;

        if ( is_callable( $build ) ) {
            // Put together when something first asks for it -- the page,
            // a REST route, get_tabs() -- and not now. Until then the menu
            // is drawn from what was handed over here, and the properties
            // below are missing so that reading one builds them all.
            $this->build = $build;

            unset( $this->config, $this->tabs, $this->components, $this->exports );
        } else {
            $this->resolve( $config );
        }

        // Register with the central registry
        Registry::register( $this->id, $this );

        // Register REST API
        RestApi::register();

        $this->init_hooks();
    }

    /**
     * Build a report whose configuration was left to a `build` callback.
     *
     * Reached by reading `config`, `tabs`, `components` or `exports` before
     * they exist, from anywhere in the class: they are unset until the
     * callback has run, which is what makes reading one run it.
     *
     * @param string $name The property asked for.
     *
     * @return mixed The property, by reference, so `$this->tabs[ $key ] = …`
     *               writes to it.
     */
    public function &__get( string $name ): mixed {
        if ( ! in_array( $name, [ 'config', 'tabs', 'components', 'exports' ], true ) ) {
            $missing = null;

            return $missing;
        }

        $this->build_now();

        return $this->{$name};
    }

    /**
     * Run the `build` callback, if it has not run.
     *
     * @return void
     */
    protected function build_now(): void {
        if ( null === $this->build ) {
            return;
        }

        $build       = $this->build;
        $this->build = null;

        $this->tabs       = [];
        $this->components = [];
        $this->exports    = [];

        $this->resolve( array_merge( $this->given, (array) $build( $this ) ) );

        foreach ( $this->pending as [ $method, $args ] ) {
            $this->{$method}( ...$args );
        }

        $this->pending = [];
    }

    /**
     * Whether the configuration has been put together yet.
     *
     * A report registered with a `build` callback says false until something
     * has asked for its tabs, components or settings.
     *
     * @return bool
     */
    public function is_built(): bool {
        return null === $this->build;
    }

    /**
     * Filter, settle and parse a whole configuration.
     *
     * @param array $config What was registered, with whatever `build` returned.
     *
     * @return void
     */
    protected function resolve( array $config ): void {
        /**
         * Filter a report's configuration as it is registered.
         *
         * How one plugin adds a tab, a component or an export to another's
         * report without that plugin having to offer a filter of its own.
         * Added before the report is registered; for one that already is,
         * see add_tab() and add_component(). For a report registered with a
         * `build` callback this runs when it is built, with what the
         * callback returned.
         *
         * @param array  $config The configuration Reports::register() was handed.
         * @param string $id     The report's id.
         */
        $config = (array) apply_filters( Runtime::hook( 'register' ), $config, $this->id );

        $this->config = wp_parse_args( $config, $this->defaults );

        if ( empty( $this->config['menu_slug'] ) ) {
            $this->config['menu_slug'] = $this->id;
        }

        $this->parse_config();
    }

    /**
     * One of the settings the menu entry is made from.
     *
     * Read from the registered configuration while the report is not built,
     * so drawing the admin menu on every screen does not build it.
     *
     * @param string $key Setting.
     *
     * @return mixed
     */
    protected function menu_setting( string $key ): mixed {
        if ( null === $this->build ) {
            return $this->config[ $key ] ?? null;
        }

        return $this->given[ $key ] ?? $this->defaults[ $key ] ?? null;
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
        if ( ! empty( $this->menu_setting( 'parent_slug' ) ) ) {
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
