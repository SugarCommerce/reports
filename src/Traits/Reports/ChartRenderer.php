<?php
/**
 * Chart Rendering
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits\Reports;

use SugarCommerce\Reports\Format;

/**
 * The canvas a chart is drawn into, and the options it is drawn with.
 *
 * Only the container is rendered here — the data arrives over REST and the
 * drawing happens in the browser. The options are built server-side anyway so
 * that currency, dates and number formatting come from the site's settings
 * rather than from a guess made in JavaScript.
 *
 * What a report cannot say through a key of its own it says through
 * `options`, which is laid over everything built here — so a chart never has
 * to be drawn by the consumer to get one setting the keys do not cover.
 */
trait ChartRenderer {

    /**
     * The colour of an axis's labels: there to be read off, not looked at.
     *
     * @var string
     */
    private const string MUTED = '#8a8d93';

    /**
     * Render a chart component.
     *
     * @param string $component_id Component ID.
     * @param array  $component    Component configuration.
     *
     * @return void
     */
    protected function render_chart( string $component_id, array $component ): void {
        $data = [];

        // Get data if callback exists
        if ( ! empty( $component['data_callback'] ) && is_callable( $component['data_callback'] ) ) {
            $data = (array) call_user_func( $component['data_callback'], $this->date_range, $component );
        }

        $labels     = (array) ( $data['labels'] ?? [] );
        $datasets   = array_values( (array) ( $data['datasets'] ?? [] ) );
        $chart_type = $this->resolve_chart_type( $component, $labels, $datasets );
        $height     = (int) ( $component['height'] ?? 300 );

        // Prepare chart configuration
        $chart_config = [
			'type'    => $chart_type,
			'data'    => [
				'labels'   => $labels,
				'datasets' => $datasets,
			],
			'options' => self::merge_chart_options(
				$this->get_chart_options( $component, $chart_type, $datasets ),
				(array) ( $component['options'] ?? [] )
			),
        ];

        $width_class = $this->get_width_class( $component['width'] ?? 'full' );
        $headline    = $this->chart_words( $component, 'headline' );
        $caption     = $this->chart_words( $component, 'caption' );
        $caption     = is_string( $caption ) && '' !== $caption ? $caption : (string) ( $component['description'] ?? '' );
        $title       = (string) ( $component['title'] ?? '' );
        $refresh     = $component['ajax_refresh'] ?? true;

        ?>
        <div class="reports-chart-wrapper <?php echo esc_attr( $width_class . ' ' . ( $component['class'] ?? '' ) ); ?>"
            data-component-id="<?php echo esc_attr( $component_id ); ?>"
            data-ajax-refresh="<?php echo $refresh ? 'true' : 'false'; ?>">

            <?php if ( '' !== $title || is_array( $headline ) ) : ?>
                <?php $period_label = ( $component['show_period'] ?? true ) ? $this->get_period_label() : ''; ?>
                <div class="reports-chart-header">
                    <h3 class="reports-chart-title">
                        <?php echo esc_html( $title ); ?>
                        <?php if ( $period_label ) : ?>
                            <span class="reports-chart-period">— <?php echo esc_html( $period_label ); ?></span>
                        <?php endif; ?>
                    </h3>
                    <?php
                    if ( is_array( $headline ) ) {
                        echo $this->headline_markup( $headline ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped as it is built.
                    }
                    ?>
                    <?php if ( '' !== $caption ) : ?>
                        <p class="reports-chart-description"><?php echo esc_html( $caption ); ?></p>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <div class="reports-chart-container" style="height: <?php echo esc_attr( (string) $height ); ?>px;">
                <canvas id="chart-<?php echo esc_attr( $component_id ); ?>"
                        class="reports-chart-canvas"
                        data-chart-id="<?php echo esc_attr( $component_id ); ?>"
                        data-chart-config="<?php echo esc_attr( (string) wp_json_encode( $chart_config ) ); ?>"></canvas>
            </div>

            <div class="reports-chart-loading" style="display: none;">
                <span class="spinner is-active"></span>
            </div>
        </div>
        <?php
    }

    /**
     * The type a chart is drawn as.
     *
     * The first dataset's own `type` when it has one: a dataset that knows
     * it is bars -- because the period turned out short -- decides the chart,
     * which is also how bars and a line are drawn together. Otherwise `auto`
     * is bars while there are few enough buckets to count (`bars_max`,
     * twelve by default: the months of a year) and a line once there are
     * more, when it is the shape being read and not each bar. Otherwise
     * `chart_type`.
     *
     * @param array $component Component configuration.
     * @param array $labels    The chart's labels.
     * @param array $datasets  Its datasets.
     *
     * @return string
     */
    protected function resolve_chart_type( array $component, array $labels, array $datasets ): string {
        $first = $datasets[0] ?? [];
        $first = is_array( $first ) ? $first : [];

        if ( ! empty( $first['type'] ) && is_string( $first['type'] ) ) {
            return $first['type'];
        }

        $type = (string) ( $component['chart_type'] ?? 'line' );

        if ( 'auto' !== $type ) {
            return $type;
        }

        $buckets = [] !== $labels ? count( $labels ) : count( (array) ( $first['data'] ?? [] ) );

        return $buckets <= (int) ( $component['bars_max'] ?? 12 ) ? 'bar' : 'line';
    }

    /**
     * A chart's headline or caption for the current range.
     *
     * Either may be given as it is or as a callable handed the range and the
     * component, since both are usually about the period being shown.
     *
     * @param array  $component Component configuration.
     * @param string $key       `headline` or `caption`.
     *
     * @return mixed The headline array, the caption string, or null.
     */
    protected function chart_words( array $component, string $key ): mixed {
        $words = $component[ $key ] ?? null;

        // Not a plain string: a caption that happens to name a function
        // must not be called.
        if ( ! is_string( $words ) && is_callable( $words ) ) {
            $words = call_user_func( $words, $this->date_range, $component );
        }

        if ( 'headline' === $key ) {
            return is_array( $words ) && isset( $words['value'] ) ? $words : null;
        }

        return is_scalar( $words ) ? (string) $words : null;
    }

    /**
     * A figure, and how it has changed, in the tiles' classes.
     *
     * Above a chart or a funnel, so the figure and its change look like the
     * tiles above them.
     *
     * @param array $headline {
     *     @type string $value     The figure, formatted.
     *     @type string $change    How it has changed, in words; empty for none.
     *     @type string $direction up, down or neutral.
     * }
     *
     * @return string Markup, escaped.
     */
    protected function headline_markup( array $headline ): string {
        $value  = '<div class="reports-tile-value">' . esc_html( (string) ( $headline['value'] ?? '' ) ) . '</div>';
        $change = (string) ( $headline['change'] ?? '' );

        if ( '' === $change ) {
            return $value;
        }

        $direction = (string) ( $headline['direction'] ?? 'neutral' );
        $direction = isset( Format::CHANGE_ICONS[ $direction ] ) ? $direction : 'neutral';

        return $value . sprintf(
            '<div class="reports-tile-change change-%1$s">%2$s%3$s</div>',
            esc_attr( $direction ),
            Format::change_icon( $direction ),
            esc_html( $change )
        );
    }

    /**
     * Get Chart.js options based on component configuration.
     *
     * The look -- level labels thinned along the bottom, faint horizontal
     * lines and nothing else, no legend for one series whose name is already
     * the heading -- and what the keys ask for: what the values are
     * (`value_format`, with `currency`), a second axis on the right
     * (`secondary_axis`), the legend and its place, and stacking.
     *
     * Money is formatted by the browser from the currency code, which knows
     * a yen has no pence, on the axis and in the tooltip alike. Chart values
     * are amounts as they are read -- 49.99, not 4999.
     *
     * @param array  $component  Component configuration.
     * @param string $chart_type Chart type.
     * @param array  $datasets   The datasets, for the legend's default.
     *
     * @return array
     */
    protected function get_chart_options( array $component, string $chart_type, array $datasets = [] ): array {
        $legend = [ 'position' => $component['legend_position'] ?? 'top' ];
        $shown  = $component['show_legend'] ?? 'auto';

        // Two series need telling apart, and one does not: its name is the
        // chart's title. A pie or a doughnut is the exception -- its legend
        // names the slices, not the series, and without it nobody can tell
        // which colour is which.
        $sliced            = in_array( $chart_type, [ 'pie', 'doughnut' ], true );
        $legend['display'] = 'auto' === $shown ? ( $sliced || count( $datasets ) > 1 ) : (bool) $shown;

        $options = [
			'responsive'          => true,
			'maintainAspectRatio' => false,

			// Chart.js formats every number on the axes and in the tooltip
			// with this, so a German admin reads 1.204,50 there as well.
			'locale'              => str_replace( '_', '-', get_user_locale() ),
			'plugins'             => [
				'legend'  => $legend,
				'tooltip' => [
					'enabled'   => true,
					'mode'      => 'index',
					'intersect' => false,
				],
			],
        ];

        // Add scales for line, bar, area charts
        if ( in_array( $chart_type, [ 'line', 'bar', 'area' ], true ) ) {
            $options['scales'] = [
				'x' => [
					'display' => true,
					'grid'    => [ 'display' => false ],
					'border'  => [ 'display' => false ],
					'ticks'   => [
						'color'         => self::MUTED,
						'autoSkip'      => true,
						'maxTicksLimit' => 12,

						// Level, always. Labels turned on their side are a
						// fence under the chart.
						'maxRotation'   => 0,
					],
					'title'   => [
						'display' => ! empty( $component['x_axis_label'] ),
						'text'    => $component['x_axis_label'] ?? '',
					],
				],
				'y' => [
					'display'     => true,
					'beginAtZero' => true,
					'grid'        => [ 'color' => '#f0f0f2' ],
					'border'      => [ 'display' => false ],
					'ticks'       => self::value_ticks( (string) ( $component['value_format'] ?? '' ), $component ),
					'title'       => [
						'display' => ! empty( $component['y_axis_label'] ),
						'text'    => $component['y_axis_label'] ?? '',
					],
				],
            ];

            $secondary = $component['secondary_axis'] ?? false;

            if ( $secondary ) {
                $secondary = is_array( $secondary ) ? $secondary : [];

                // A second scale on the right, for each dataset whose
                // `yAxisID` is `y1`: orders under revenue, a count under an
                // amount. A count unless it says otherwise.
                $options['scales']['y1'] = [
					'position'    => 'right',
					'beginAtZero' => true,
					'border'      => [ 'display' => false ],

					// One set of horizontal lines. Two that do not line up is
					// a chart nobody can read a value off.
					'grid'        => [ 'drawOnChartArea' => false ],
					'ticks'       => self::value_ticks( (string) ( $secondary['value_format'] ?? 'integer' ), $secondary + $component ),
					'title'       => [
						'display' => ! empty( $secondary['label'] ),
						'text'    => $secondary['label'] ?? '',
					],
                ];
            }

            // Stacked option
            if ( ! empty( $component['stacked'] ) ) {
                $options['scales']['x']['stacked'] = true;
                $options['scales']['y']['stacked'] = true;
            }
        }

        // Line chart specific options
        if ( $chart_type === 'line' || $chart_type === 'area' ) {
            $options['elements'] = [
				'line' => [
					'tension' => $component['tension'] ?? 0.4,
				],
            ];
        }

        return $options;
    }

    /**
     * The ticks of a value axis.
     *
     * @param string $format    `currency`, `integer`, or anything else for
     *                          plain numbers.
     * @param array  $component Where `currency` is read from.
     *
     * @return array
     */
    protected static function value_ticks( string $format, array $component ): array {
        $ticks = [
			'color'         => self::MUTED,
			'padding'       => 10,
			'maxTicksLimit' => 4,
        ];

        return $ticks + match ( $format ) {
            'currency' => [
				'format' => [
					'style'               => 'currency',
					'currency'            => strtoupper( (string) ( $component['currency'] ?? 'USD' ) ),
					'trailingZeroDisplay' => 'stripIfInteger',
				],
            ],

            // Nobody places half an order.
            'integer' => [ 'precision' => 0 ],
            default   => [],
        };
    }

    /**
     * Lay a chart's own options over the ones built for it.
     *
     * Recursive for keyed arrays, so `[ 'scales' => [ 'y' => [ 'max' => 10 ] ] ]`
     * changes the one setting and keeps the rest. A list is replaced whole:
     * merged index by index, a palette of two over a palette of eight would
     * keep six colours nobody asked for.
     *
     * @param array $built    The options built from the keys.
     * @param array $override The component's `options`.
     *
     * @return array
     */
    public static function merge_chart_options( array $built, array $override ): array {
        foreach ( $override as $key => $value ) {
            if (
                is_array( $value ) && [] !== $value && ! array_is_list( $value )
                && isset( $built[ $key ] ) && is_array( $built[ $key ] ) && ! array_is_list( $built[ $key ] )
            ) {
                $built[ $key ] = self::merge_chart_options( $built[ $key ], $value );

                continue;
            }

            $built[ $key ] = $value;
        }

        return $built;
    }
}
