<?php
/**
 * Component Renderer Trait
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits;

use SugarCommerce\Reports\Format;
use SugarCommerce\Reports\Utils\Runtime;

/**
 * Trait ComponentRenderer
 *
 * Handles rendering of report components.
 */
trait ComponentRenderer {

    use ChartRenderer;
    use FunnelRenderer;
    use ProgressRenderer;
    use TableRenderer;
    use TileRenderer;

    /**
     * Render all components for a tab.
     *
     * @param array $components Components to render.
     *
     * @return void
     */
    protected function render_components( array $components ): void {
        if ( empty( $components ) ) {
            return;
        }

        echo '<div class="reports-components">';

        // Group tiles together for grid layout
        $current_group = [];
        $current_type  = null;

        foreach ( $components as $component_id => $component ) {
            $type = $component['type'] ?? 'tile';

            // If we're switching from tiles to something else, render the tile group
            if ( $current_type === 'tile' && $type !== 'tile' && ! empty( $current_group ) ) {
                $this->render_tiles_grid( $current_group );
                $current_group = [];
            }

            if ( $type === 'tile' ) {
                $current_group[ $component_id ] = $component;
                $current_type                   = 'tile';
            } else {
                $current_type = $type;
                $this->render_component( $component_id, $component );
            }
        }

        // Render any remaining tiles
        if ( ! empty( $current_group ) ) {
            $this->render_tiles_grid( $current_group );
        }

        echo '</div>';
    }

    /**
     * Render a single component.
     *
     * @param string $component_id Component ID.
     * @param array  $component    Component configuration.
     *
     * @return void
     */
    protected function render_component( string $component_id, array $component ): void {
        $type = $component['type'] ?? 'tile';

        /**
         * Allow custom component rendering.
         *
         * @param bool   $rendered     Whether the component was rendered.
         * @param string $component_id Component ID.
         * @param array  $component    Component configuration.
         * @param array  $date_range   Current date range.
         */
        $rendered = apply_filters( Runtime::hook( 'render_component' ), false, $component_id, $component, $this->date_range );

        if ( $rendered ) {
            return;
        }

        switch ( $type ) {
            case 'tile':
                $this->render_tile( $component_id, $component );
                break;

            case 'tiles_group':
                $this->render_tiles_group( $component_id, $component );
                break;

            case 'chart':
                $this->render_chart( $component_id, $component );
                break;

            case 'table':
                $this->render_table( $component_id, $component );
                break;

            case 'progress':
                $this->render_progress( $component_id, $component );
                break;

            case 'breakdown':
                $this->render_breakdown( $component_id, $component );
                break;

            case 'stat_list':
                $this->render_stat_list( $component_id, $component );
                break;

            case 'html':
                $this->render_html_component( $component_id, $component );
                break;

            case 'funnel':
                $this->render_funnel( $component_id, $component );
                break;

            default:
                // Check for render callback
                if ( ! empty( $component['render_callback'] ) && is_callable( $component['render_callback'] ) ) {
                    call_user_func( $component['render_callback'], $component, $this->date_range, $this );
                }
                break;
        }
    }

    /**
     * Render an HTML component.
     *
     * What it says comes from `render_callback`, which prints, or from
     * `content`: markup as it is, or a callable handed the range and the
     * component that returns it. Markup passes through wp_kses_post();
     * with `markup` false it is plain text and is escaped.
     *
     * With `hide_when_empty`, a component with nothing to say takes no room
     * at all -- no box, no title over nothing. A sentence that only applies
     * to some periods ("nothing sold yet") is the case it is for. Off by
     * default, because an empty box is also what a script fills in later.
     *
     * The `note` appearance is that sentence in a card of its own, across
     * the top of a tab, in the type a chart's caption is read in.
     *
     * @param string $component_id Component ID.
     * @param array  $component    Component configuration.
     *
     * @return void
     */
    protected function render_html_component( string $component_id, array $component ): void {
        $width_class = $this->get_width_class( $component['width'] ?? 'full' );
        $content     = $this->html_content( $component );
        $title       = (string) ( $component['title'] ?? '' );

        if ( ! empty( $component['hide_when_empty'] ) && '' === trim( $content ) ) {
            return;
        }

        if ( 'note' === ( $component['appearance'] ?? '' ) ) {
            printf(
                '<div class="reports-chart-wrapper reports-note %1$s" data-component-id="%2$s">%3$s<div class="reports-note-text">%4$s</div></div>',
                esc_attr( trim( $width_class . ' ' . ( $component['class'] ?? '' ) ) ),
                esc_attr( $component_id ),
                '' === $title ? '' : '<h3 class="reports-chart-title">' . esc_html( $title ) . '</h3>',
                $content // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in html_content().
            );

            return;
        }

        ?>
        <div class="reports-html-component <?php echo esc_attr( $width_class . ' ' . ( $component['class'] ?? '' ) ); ?>"
            data-component-id="<?php echo esc_attr( $component_id ); ?>">

            <?php if ( '' !== $title ) : ?>
                <h3 class="reports-html-title"><?php echo esc_html( $title ); ?></h3>
            <?php endif; ?>

            <div class="reports-html-content">
                <?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in html_content(). ?>
            </div>
        </div>
        <?php
    }

    /**
     * What an HTML component says, escaped.
     *
     * Collected before anything is printed, so an empty one can be left
     * out whole.
     *
     * @param array $component Component configuration.
     *
     * @return string
     */
    protected function html_content( array $component ): string {
        if ( ! empty( $component['render_callback'] ) && is_callable( $component['render_callback'] ) ) {
            ob_start();

            try {
                call_user_func( $component['render_callback'], $this->date_range, $component, $this );
            } finally {
                $printed = (string) ob_get_clean();
            }

            return $printed;
        }

        $content = $component['content'] ?? '';

        // Not a plain string: content that happens to name a function must
        // not be called.
        if ( ! is_string( $content ) && is_callable( $content ) ) {
            $content = call_user_func( $content, $this->date_range, $component );
        }

        $content = is_scalar( $content ) ? (string) $content : '';

        return ( $component['markup'] ?? true ) ? wp_kses_post( $content ) : esc_html( $content );
    }

    /**
     * Get CSS width class for component.
     *
     * @param string $width Width setting.
     *
     * @return string
     */
    protected function get_width_class( string $width ): string {
        return match ( $width ) {
            'full' => 'reports-component--full',
            'half' => 'reports-component--half',
            'third' => 'reports-component--third',
            'quarter' => 'reports-component--quarter',
            'two-thirds' => 'reports-component--two-thirds',
            default => 'reports-component--auto',
        };
    }

    /**
     * Format a value based on type.
     *
     * Uses wp-currencies library for currency formatting if available.
     * Uses sugarcommerce/dates for date formatting.
     *
     * @param mixed  $value     The value to format.
     * @param string $format    The format type.
     * @param array  $component Component configuration (for currency option).
     *
     * @return string
     */
    protected function format_value( $value, string $format, array $component = [] ): string {
        return Format::value( $value, $format, (string) ( $component['currency'] ?? 'USD' ) );
    }

    /**
     * Format a change value.
     *
     * @param mixed $change The change value.
     *
     * @return string
     */
    protected function format_change( $change ): string {
        return Format::change( $change );
    }
}
