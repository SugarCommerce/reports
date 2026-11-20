<?php
/**
 * Funnel Rendering
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits\Reports;

/**
 * How many of those who started something went on to finish it.
 *
 * One card: a figure for the whole way through and how it has changed, the
 * steps side by side with a bar each against the first and a line saying
 * how many carried on to the next, and a line under them for whatever else
 * is worth knowing. Baskets to checkouts to orders; sign-ups to trials to
 * paid.
 *
 * Drawn as nothing at all when the first step has nothing in it. A shop
 * whose buyers all arrive by a link straight to the payment page has no
 * baskets, and a card of noughts would tell it that it had lost every sale.
 *
 * Drawn with the page and not refreshed in place: the card is the counting
 * and its words together, and the words are written in PHP.
 */
trait FunnelRenderer {

    /**
     * Render a funnel component.
     *
     * `data_callback` is handed the range and the component, and returns the
     * steps -- or `steps` with any of `headline`, `description` and `foot`
     * beside them. Each step is a `label` and a `count`, and may say what
     * carried on from it: `note` as it is to be read, or `next` as a format
     * whose `%s` is the share that reached the step after.
     *
     * @param string $component_id Component ID.
     * @param array  $component    Component configuration.
     *
     * @return void
     */
    protected function render_funnel( string $component_id, array $component ): void {
        $data = [];

        if ( ! empty( $component['data_callback'] ) && is_callable( $component['data_callback'] ) ) {
            $data = (array) call_user_func( $component['data_callback'], $this->date_range, $component );
        }

        $data  = array_is_list( $data ) ? [ 'steps' => $data ] : $data;
        $steps = self::funnel_steps( (array) ( $data['steps'] ?? [] ), $component );

        if ( [] === $steps || $steps[0]['count'] <= 0 ) {
            return;
        }

        $headline = $data['headline'] ?? null;
        $headline = is_array( $headline ) && isset( $headline['value'] )
            ? $headline
            : [ 'value' => self::whole_percent( end( $steps )['count'] / $steps[0]['count'] ) ];

        $foot = $data['foot'] ?? '';
        $foot = is_array( $foot ) ? implode( ' · ', array_filter( array_map( 'strval', $foot ), 'strlen' ) ) : (string) $foot;

        $description = (string) ( $data['description'] ?? $component['description'] ?? '' );
        $width_class = $this->get_width_class( $component['width'] ?? 'full' );

        // The list's own custom properties: as many columns as steps, and
        // the bars in the report's colour unless the component names one.
        $style = '--reports-funnel-columns:' . count( $steps ) . ';';
        $fill  = self::css_colour( (string) ( $component['colour'] ?? $component['color'] ?? '' ) );

        if ( '' !== $fill ) {
            $style .= '--reports-funnel-fill:' . $fill . ';';
        }

        $items = '';

        foreach ( $steps as $step ) {
            $items .= sprintf(
                '<li><span class="reports-funnel-label">%1$s</span><strong>%2$s</strong>' .
                '<span class="reports-funnel-track" aria-hidden="true"><span class="reports-funnel-fill" style="width:%3$s%%"></span></span>' .
                '<span class="reports-funnel-next">%4$s</span></li>',
                esc_html( $step['label'] ),
                esc_html( number_format_i18n( $step['count'] ) ),
                esc_attr( (string) $step['width'] ),
                esc_html( $step['note'] )
            );
        }

        printf(
            '<div class="reports-chart-wrapper reports-funnel %1$s" data-component-id="%2$s" data-ajax-refresh="false">' .
            '<div class="reports-chart-header"><h3 class="reports-chart-title">%3$s</h3>%4$s%5$s</div>' .
            '<ol class="reports-funnel-steps" style="%6$s">%7$s</ol>%8$s</div>',
            esc_attr( trim( $width_class . ' ' . ( $component['class'] ?? '' ) ) ),
            esc_attr( $component_id ),
            esc_html( (string) ( $component['title'] ?? '' ) ),
            $this->headline_markup( $headline ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped as it is built.
            '' === $description ? '' : '<p class="reports-chart-description">' . esc_html( $description ) . '</p>',
            esc_attr( $style ),
            $items, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped as it is built.
            '' === $foot ? '' : '<p class="reports-funnel-foot">' . esc_html( $foot ) . '</p>'
        );
    }

    /**
     * The steps, each with its bar's width and its line about the next.
     *
     * @param array $steps     The steps as the callback gave them.
     * @param array $component Component configuration: `next`, the format
     *                         for a step that names none.
     *
     * @return array<int, array{label: string, count: int, width: float, note: string}>
     */
    protected static function funnel_steps( array $steps, array $component ): array {
        $steps = array_values( array_filter( $steps, 'is_array' ) );
        $whole = max( 1, (int) ( $steps[0]['count'] ?? 0 ) );
        $drawn = [];

        foreach ( $steps as $at => $step ) {
            $count = max( 0, (int) ( $step['count'] ?? 0 ) );
            $after = $steps[ $at + 1 ] ?? null;
            $note  = $step['note'] ?? null;

            // The last step carries on to nothing, and a rate of nothing is
            // not a rate: both say nothing unless told what to say.
            if ( null === $note && null !== $after && $count > 0 ) {
                $format = (string) ( $step['next'] ?? $component['next'] ?? '' );

                /* translators: %s: the share of one step that reached the next, as a percentage. */
                $format = '' !== $format ? $format : __( '%s continued', 'sugarcommerce' );
                $note   = sprintf( $format, self::whole_percent( max( 0, (int) ( $after['count'] ?? 0 ) ) / $count ) );
            }

            $drawn[] = [
                'label' => (string) ( $step['label'] ?? '' ),
                'count' => $count,
                'width' => round( min( 100, $count / $whole * 100 ), 2 ),
                'note'  => (string) ( $note ?? '' ),
            ];
        }

        return $drawn;
    }

    /**
     * A share as a whole percentage: 0.623 is "62%".
     *
     * @param float $share The share, from 0 to 1.
     *
     * @return string
     */
    protected static function whole_percent( float $share ): string {
        return number_format_i18n( round( $share * 100 ) ) . '%';
    }

    /**
     * A colour fit to go in a style attribute, or nothing.
     *
     * Hex, a name, or a function of numbers -- `rgb()`, `hsl()`, `var()` of
     * a custom property. Anything that could close the declaration is not a
     * colour.
     *
     * @param string $colour What the component gave.
     *
     * @return string
     */
    protected static function css_colour( string $colour ): string {
        $colour = trim( $colour );

        return 1 === preg_match( '/^[#a-zA-Z0-9(),.%\s-]+$/', $colour ) ? $colour : '';
    }
}
