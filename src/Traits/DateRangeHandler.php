<?php
/**
 * Date Range Handler Trait
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits;

use SugarCommerce\Dates\Preset;
use SugarCommerce\Dates\Range;
use SugarCommerce\Dates\Site;
use SugarCommerce\Reports\Format;

/**
 * Trait DateRangeHandler
 *
 * Handles date range selection and calculation.
 * Uses sugarcommerce/dates for UTC and local timezone handling.
 */
trait DateRangeHandler {

    /**
     * Get the current date range from request.
     *
     * Returns dates in UTC for database queries.
     *
     * @return array
     */
    protected function get_current_date_range(): array {
        $preset     = isset( $_GET['date_preset'] ) ? sanitize_key( wp_unslash( $_GET['date_preset'] ) ) : '';
        $date_start = isset( $_GET['date_start'] ) ? sanitize_text_field( wp_unslash( $_GET['date_start'] ) ) : '';
        $date_end   = isset( $_GET['date_end'] ) ? sanitize_text_field( wp_unslash( $_GET['date_end'] ) ) : '';

        // Use default preset if none specified
        if ( empty( $preset ) ) {
            $preset = $this->config['default_preset'] ?? 'this_month';
        }

        // A slug nobody recognises, with no dates to make it a custom range,
        // is a typo in a config or a stale link. It resolves to something
        // either way; without this the button would call it "Custom Range".
        if ( 'custom' !== $preset && null === Preset::tryFrom( $preset ) && ( '' === $date_start || '' === $date_end ) ) {
            $preset = 'this_month';
        }

        return self::range_to_array( self::resolve_range( $preset, $date_start, $date_end, $this->config ), $preset );
    }

    /**
     * A preset, or two picked dates, as a range -- with the days being
     * whoever's the report says they are.
     *
     * The one place this library turns "today" into two moments, for the
     * screen, the REST routes and the exports alike, so they cannot disagree.
     *
     * Two config keys decide it. `timezone` is `'utc'` (the default, and what
     * this library always did: days start and end at midnight UTC), `'site'`
     * (the site's own midnight, from Settings > General, with the day the
     * clocks change as long as it really is), or a DateTimeZone. `week_starts`
     * is 0 for Sunday to 6 for Saturday; left null it is Monday for `'utc'`
     * and the site's "Week Starts On" otherwise.
     *
     * Either way `start` and `end` come back as UTC, for querying a column
     * that stores UTC. Only where the boundaries fall moves.
     *
     * @param string $preset A preset slug, or '' / 'custom' for two dates.
     * @param string $from   The first date, when picked.
     * @param string $to     The last date, inclusive as a person means it.
     * @param array  $config The report's configuration.
     *
     * @return Range
     */
    public static function resolve_range( string $preset, string $from = '', string $to = '', array $config = [] ): Range {
        $zone = $config['timezone'] ?? 'utc';
        $week = $config['week_starts'] ?? null;

        if ( 'site' === $zone ) {
            $zone = wp_timezone();
        }

        if ( ! $zone instanceof \DateTimeZone ) {
            // Exactly the call this made before there was anything to say.
            return null === $week
                ? Preset::resolve( $preset, $from, $to )
                : Preset::resolve( $preset, $from, $to, null, null, (int) $week );
        }

        return Preset::resolve( $preset, $from, $to, null, $zone, Site::week_starts( null === $week ? null : (int) $week ) );
    }

    /**
     * A Range as the array the rest of this library passes around.
     *
     * The library predates the value object and threads an array through
     * every screen, filter and REST route. Converting at the edge keeps that
     * one shape rather than rewriting all of it.
     *
     * `start` and `end` are UTC, for querying. The `_local` pair is the same
     * moment in the site's timezone, for showing somebody.
     *
     * @param Range  $range  The range.
     * @param string $preset Which preset produced it.
     *
     * @return array
     */
    protected static function range_to_array( Range $range, string $preset = 'custom' ): array {
        return [
            'start'       => $range->start(),
            'end'         => $range->end(),
            'start_local' => Site::format( $range->start(), 'Y-m-d H:i:s' ),
            'end_local'   => Site::format( $range->end(), 'Y-m-d H:i:s' ),
            'preset'      => $preset,
        ];
    }

    /**
     * Calculate date range from preset.
     *
     * Resolved in the timezone the report is configured for (see
     * resolve_range()), and handed back as UTC for database queries.
     *
     * @param string $preset Preset name.
     *
     * @return array Contains UTC start/end for queries and local dates for display.
     */
    public function calculate_date_range( string $preset ): array {
        return self::range_to_array( self::resolve_range( $preset, '', '', $this->config ), $preset );
    }

    /**
     * Get the previous period for comparison.
     *
     * @param array $date_range Current date range.
     *
     * @return array
     */
    public function get_previous_period( array $date_range ): array {
        $previous = Range::between( $date_range['start'], $date_range['end'] )->previous();

        return self::range_to_array( $previous, 'previous' );
    }

    /**
     * Get date range options for dropdown.
     *
     * Uses the presets of sugarcommerce/dates and adds 'custom' option.
     *
     * @return array
     */
    protected function get_date_range_options(): array {
        // Check if custom presets defined in config
        if ( ! empty( $this->config['date_presets'] ) ) {
            return $this->config['date_presets'];
        }

        // The ranges people actually ask for, and a way to ask for any
        // other. Every preset the date library knows still resolves from a
        // link or a config; fifteen of them in a menu is a list to read
        // through each time, most of it near-duplicates of its neighbours.
        $all     = Preset::options();
        $options = [];

        foreach ( [ 'today', 'last_7', 'last_30', 'last_90', 'this_month', 'last_month', 'this_year', 'all_time' ] as $slug ) {
            if ( isset( $all[ $slug ] ) ) {
                $options[ $slug ] = $all[ $slug ];
            }
        }

        $options['custom'] = __( 'Custom range…', 'sugarcommerce' );

        return $options;
    }

    /**
     * Render the date picker dropdown.
     *
     * @return void
     */
    protected function render_date_picker(): void {
        $presets       = $this->get_date_range_options();
        $current_range = $this->date_range;
        $preset        = $current_range['preset'] ?? 'this_month';

        $preset_label = $presets[ $preset ] ?? __( 'Custom Range', 'sugarcommerce' );

        if ( $preset === 'custom' ) {
            $preset_label = self::format_range( $current_range['start'], $current_range['end'] );
        }

        ?>
        <div class="reports-date-picker" data-report-id="<?php echo esc_attr( $this->id ); ?>">
            <?php
            /*
             * No calendar glyph. The button says which range is showing,
             * which is the thing worth reading, and core puts no icon in
             * front of its own button text anywhere in the admin.
             *
             * The caret stays: it is not decoration but the only cue that
             * this opens a menu rather than doing something. aria-expanded
             * says the same thing to anyone not looking at it.
             */
            ?>
            <button type="button" class="reports-date-picker-toggle button" aria-expanded="false">
                <span class="reports-date-picker-label"><?php echo esc_html( $preset_label ); ?></span>
                <?php echo Format::icon( 'heroicons-outline:chevron-down' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built and escaped by the icon helper. ?>
            </button>

            <div class="reports-date-picker-dropdown" style="display: none;">
                <div class="reports-date-picker-presets">
                    <?php foreach ( $presets as $preset_key => $preset_name ) : ?>
                        <?php if ( $preset_key === 'custom' ) : ?>
                            <div class="reports-date-picker-divider"></div>
                        <?php endif; ?>
                        <button type="button"
                                class="reports-date-preset<?php echo $preset_key === $preset ? ' active' : ''; ?>"
                                data-preset="<?php echo esc_attr( $preset_key ); ?>">
                            <?php echo esc_html( $preset_name ); ?>
                        </button>
                    <?php endforeach; ?>
                </div>

                <div class="reports-date-picker-custom" style="display: none;">
                    <div class="reports-date-picker-custom-row">
                        <label>
                            <?php esc_html_e( 'Start Date', 'sugarcommerce' ); ?>
                            <input type="date"
                                    class="reports-date-start"
                                    value="<?php echo esc_attr( self::picker_day( (string) ( $current_range['start'] ?? '' ) ) ); ?>"/>
                        </label>
                    </div>
                    <div class="reports-date-picker-custom-row">
                        <label>
                            <?php esc_html_e( 'End Date', 'sugarcommerce' ); ?>
                            <input type="date"
                                    class="reports-date-end"
                                    value="<?php echo esc_attr( self::picker_day( (string) ( $current_range['end'] ?? '' ), true ) ); ?>"/>
                        </label>
                    </div>
                    <div class="reports-date-picker-custom-actions">
                        <button type="button" class="button reports-date-picker-cancel">
                            <?php esc_html_e( 'Cancel', 'sugarcommerce' ); ?>
                        </button>
                        <button type="button" class="button button-primary reports-date-picker-apply">
                            <?php esc_html_e( 'Apply', 'sugarcommerce' ); ?>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Format date for display using WordPress settings.
     *
     * @param string $utc_date UTC date string.
     * @param string $format   Date format (defaults to WordPress setting).
     *
     * @return string
     */
    public function format_date( string $utc_date, string $format = '' ): string {
        return Site::format( $utc_date, $format );
    }

    /**
     * Get number of days in date range.
     *
     * @param array $date_range Date range array with UTC dates.
     *
     * @return int
     */
    public function get_days_in_range( array $date_range ): int {
        return Range::between( $date_range['start'], $date_range['end'] )->days();
    }

    /**
     * Get a human-readable label for the current period.
     *
     * @return string
     */
    protected function get_period_label(): string {
        $preset  = $this->date_range['preset'] ?? 'this_month';
        $presets = $this->get_date_range_options();

        // Return the preset label if found
        if ( isset( $presets[ $preset ] ) && $preset !== 'custom' ) {
            return $presets[ $preset ];
        }

        // For custom, return the formatted date range
        if ( $preset === 'custom' && ! empty( $this->date_range['start'] ) && ! empty( $this->date_range['end'] ) ) {
            return self::format_range( $this->date_range['start'], $this->date_range['end'] );
        }

        return '';
    }

    /**
     * A range's end as the last moment inside it.
     *
     * A range's end is the first moment after it: "1 May to 31 May" ends at
     * midnight on 1 June. Shown to somebody, that is the wrong day -- the
     * last day they picked is the one before.
     *
     * @param string $end UTC end, exclusive.
     *
     * @return string UTC, a second earlier; empty for an unreadable end.
     */
    protected static function last_moment( string $end ): string {
        $unix = strtotime( $end . ' UTC' );

        return false === $unix ? '' : gmdate( 'Y-m-d H:i:s', $unix - 1 );
    }

    /**
     * A day as a date input holds it: Y-m-d in the site's timezone.
     *
     * The input refuses anything else -- a time after the date leaves it
     * empty -- so the custom range opened blank whatever was showing.
     *
     * @param string $value UTC moment.
     * @param bool   $end   Whether it is a range's (exclusive) end, which
     *                      shows as the day before.
     *
     * @return string
     */
    protected static function picker_day( string $value, bool $end = false ): string {
        if ( '' === $value ) {
            return '';
        }

        return Site::format( $end ? self::last_moment( $value ) : $value, 'Y-m-d' );
    }

    /**
     * "1 – 31 May 2026", or the two dates in full when they straddle a month.
     *
     * @param string $start UTC start.
     * @param string $end   UTC end.
     *
     * @return string
     */
    protected static function format_range( string $start, string $end ): string {
        $from = Site::format( $start, 'j M Y' );
        $to   = Site::format( self::last_moment( $end ), 'j M Y' );

        if ( '' === $from || '' === $to ) {
            return '';
        }

        return $from === $to ? $from : $from . ' – ' . $to;
    }
}