<?php
/**
 * Progress And Breakdown Rendering
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits;

use SugarCommerce\Reports\Format;

/**
 * Two shapes that a chart is the wrong answer to.
 *
 * A **progress** component is one number against a target — takings against a
 * monthly goal, storage used against a quota. A chart of two values is not a
 * chart, and a number on its own leaves the reader doing the division.
 *
 * A **breakdown** is a ranked list with a bar behind each row: top products,
 * traffic by source, orders by status. This is the job a pie chart is usually
 * given and does badly — people read angles poorly, ranked order is what the
 * question was actually about, and a pie needs a legend that a narrow admin
 * column has no room for. A horizontal bar list is read top to bottom, sorted
 * already, and each row can carry its own number.
 *
 * Both are markup and CSS. Neither needs Chart.js, neither needs a canvas, and
 * both are legible to a screen reader without any extra work: a progress bar
 * carries its own ARIA role and values, and a breakdown is a list of labels
 * and numbers that happens to have bars drawn behind it.
 */
trait ProgressRenderer {

	/**
	 * What a component's callback has to say, on the first render.
	 *
	 * These draw with their data rather than empty-and-then-over-REST. A
	 * component that arrives blank and fills in a moment later is a page
	 * that flashes, and one where the fetch fails is a page that says
	 * nothing at all — while the server had the numbers the whole time.
	 * The refresh path updates them in place afterwards.
	 *
	 * @param array<string, mixed> $component The component's configuration.
	 *
	 * @return array<string, mixed>
	 */
	private function component_data( array $component ): array {
		$callback = $component['data_callback'] ?? null;

		if ( ! $callback || ! is_callable( $callback ) ) {
			return [];
		}

		$data = (array) call_user_func( $callback, $this->date_range, $component );

		self::warn_about_the_rows_key( $data );

		return $data;
	}

	/**
	 * Say so when the rows arrived under the wrong key.
	 *
	 * A breakdown and a stat list both read `rows`. Handing them `items` --
	 * which is the obvious guess, and what a list of things is usually
	 * called -- is not an error: the component draws its title, finds nothing
	 * to list, and shows its empty message. It looks exactly like a period
	 * with no data in it, which is the answer somebody is often expecting.
	 *
	 * @param array<string, mixed> $data What the callback returned.
	 *
	 * @return void
	 */
	private static function warn_about_the_rows_key( array $data ): void {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG || ! function_exists( '_doing_it_wrong' ) ) {
			return;
		}

		if ( ! empty( $data['rows'] ) || ! empty( $data['value'] ) ) {
			return;
		}

		foreach ( [ 'items', 'data', 'results' ] as $wrong ) {
			if ( empty( $data[ $wrong ] ) ) {
				continue;
			}

			_doing_it_wrong(
				__METHOD__,
				sprintf(
					/* translators: %s: the key the rows were given under */
					esc_html__( 'A component was given its rows as "%s". The key is "rows"; it will render as empty.', 'sugarcommerce' ),
					esc_html( $wrong )
				),
				'1.0.0'
			);

			return;
		}
	}

	/**
	 * One number against a target.
	 *
	 * @param string               $component_id The component.
	 * @param array<string, mixed> $component    Its configuration.
	 *
	 * @return void
	 */
	protected function render_progress( string $component_id, array $component ): void {
		$width  = $this->get_width_class( (string) ( $component['width'] ?? 'full' ) );
		$format = (string) ( $component['value_format'] ?? 'number' );
		$data   = $this->component_data( $component );

		?>
		<div class="reports-progress-wrapper <?php echo esc_attr( $width . ' ' . ( $component['class'] ?? '' ) ); ?>"
			data-component-id="<?php echo esc_attr( $component_id ); ?>"
			data-component-type="progress">
			<?php if ( ! empty( $component['title'] ) ) : ?>
				<h3 class="reports-progress-title"><?php echo esc_html( $component['title'] ); ?></h3>
			<?php endif; ?>

			<div class="reports-progress" data-value-format="<?php echo esc_attr( $format ); ?>">
				<?php $this->render_progress_bar( $data, $component ); ?>
			</div>

			<?php if ( ! empty( $component['description'] ) ) : ?>
				<p class="reports-progress-description"><?php echo esc_html( $component['description'] ); ?></p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * The bar itself, and the sentence under it.
	 *
	 * Rendered empty on load and filled in over REST, like every other
	 * component here — but the element is present either way, so the script
	 * has something to write into rather than markup to invent.
	 *
	 * @param array<string, mixed> $data      What the callback returned.
	 * @param array<string, mixed> $component Its configuration.
	 *
	 * @return void
	 */
	protected function render_progress_bar( array $data, array $component ): void {
		// Kept as given for the formatter, cast only for the arithmetic.
		// Format::value() reads an int as minor units and a fraction as a
		// decimal amount, so formatting the cast copy renders every currency
		// figure a hundred times too large.
		$raw_value  = $data['value'] ?? 0;
		$raw_target = $data['target'] ?? $component['target'] ?? 0;

		$value    = (float) $raw_value;
		$target   = (float) $raw_target;
		$format   = (string) ( $component['value_format'] ?? 'number' );
		$currency = (string) ( $component['currency'] ?? 'USD' );

		// Nought to a hundred, whatever the numbers are. A target of nought
		// is a target nobody set, and dividing by it is the one arithmetic
		// mistake that takes the page with it.
		$percent = $target > 0 ? min( 100, max( 0, ( $value / $target ) * 100 ) ) : 0;

		printf(
			'<div class="reports-progress-track" role="progressbar" aria-valuenow="%s" aria-valuemin="0" aria-valuemax="100" aria-label="%s">' .
			'<div class="reports-progress-fill" style="width:%s%%"></div></div>',
			esc_attr( (string) round( $percent ) ),
			esc_attr( (string) ( $component['title'] ?? __( 'Progress', 'sugarcommerce' ) ) ),
			esc_attr( (string) round( $percent, 2 ) )
		);

		printf(
			'<p class="reports-progress-meta"><span class="reports-progress-percent">%s</span>' .
			'<span class="reports-progress-figures">%s</span></p>',
			esc_html( number_format_i18n( $percent, $percent < 10 ? 1 : 0 ) . '%' ),
			esc_html(
				sprintf(
					/* translators: 1: the value reached, 2: the target */
					__( '%1$s of %2$s', 'sugarcommerce' ),
					Format::value( $raw_value, $format, $currency ),
					Format::value( $raw_target, $format, $currency )
				)
			)
		);
	}

	/**
	 * A ranked list with a bar behind each row.
	 *
	 * @param string               $component_id The component.
	 * @param array<string, mixed> $component    Its configuration.
	 *
	 * @return void
	 */
	protected function render_breakdown( string $component_id, array $component ): void {
		$width = $this->get_width_class( (string) ( $component['width'] ?? 'full' ) );
		$rows  = (array) ( $this->component_data( $component )['rows'] ?? [] );

		?>
		<div class="reports-breakdown-wrapper <?php echo esc_attr( $width . ' ' . ( $component['class'] ?? '' ) ); ?>"
			data-component-id="<?php echo esc_attr( $component_id ); ?>"
			data-component-type="breakdown">
			<?php if ( ! empty( $component['title'] ) ) : ?>
				<h3 class="reports-breakdown-title"><?php echo esc_html( $component['title'] ); ?></h3>
			<?php endif; ?>

			<ul class="reports-breakdown"
				data-value-format="<?php echo esc_attr( (string) ( $component['value_format'] ?? 'number' ) ); ?>">
				<?php $this->render_breakdown_rows( $rows, $component ); ?>
			</ul>

			<p class="reports-breakdown-empty"<?php echo [] === $rows ? '' : ' hidden'; ?>>
				<?php echo esc_html( (string) ( $component['empty_message'] ?? __( 'No data available', 'sugarcommerce' ) ) ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * The rows of a breakdown.
	 *
	 * Each bar is drawn against the largest value rather than against the
	 * total, so the top row always fills the width. Against the total, a list
	 * of eight roughly equal things is eight identical stubs and the shape
	 * says nothing — which is the failure a breakdown exists to avoid.
	 *
	 * @param array<int, mixed>    $rows      Rows to draw.
	 * @param array<string, mixed> $component Its configuration.
	 *
	 * @return void
	 */
	protected function render_breakdown_rows( array $rows, array $component ): void {
		$rows = [] === $rows ? (array) ( $component['rows'] ?? [] ) : $rows;

		if ( [] === $rows ) {
			return;
		}

		$format   = (string) ( $component['value_format'] ?? 'number' );
		$currency = (string) ( $component['currency'] ?? 'USD' );
		$values   = array_map( static fn( $row ): float => (float) ( ( (array) $row )['value'] ?? 0 ), $rows );
		$largest  = max( $values ) ?: 1.0;
		$total    = array_sum( $values ) ?: 1.0;

		foreach ( $rows as $row ) {
			$row = (array) $row;

			// Two values, deliberately. The bar maths needs a float; the
			// formatter must not have one.
			//
			// Format::value() tells minor units from a decimal amount by
			// looking at the value -- an int is minor units, a fraction means
			// a decimal. Casting first makes every amount look like a
			// decimal, so 4900 minor units rendered as 4,900.00 rather than
			// 49.00. A hundred times too large, in the right currency, with
			// the bar the right length.
			$number = (float) ( $row['value'] ?? 0 );

			// A row may say what colour its bar is -- a brand's, say. Only
			// a hex colour gets through, and the stylesheet softens it.
			$color = (string) sanitize_hex_color( (string) ( $row['color'] ?? '' ) );

			printf(
				'<li class="reports-breakdown-row">' .
				'<span class="reports-breakdown-label">%s%s</span>' .
				'<span class="reports-breakdown-track"><span class="reports-breakdown-fill" style="width:%s%%%s"></span></span>' .
				'<span class="reports-breakdown-share">%s</span>' .
				'<span class="reports-breakdown-value">%s</span></li>',
				// Escaped where it is built, and empty for a row without one.
				self::row_icon( $row ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				// A row with somewhere to go is a link to it: the name of a
				// product is the obvious thing to press to see the product.
				empty( $row['url'] )
					? esc_html( (string) ( $row['label'] ?? '' ) )
					: sprintf( '<a href="%s">%s</a>', esc_url( (string) $row['url'] ), esc_html( (string) ( $row['label'] ?? '' ) ) ),
				esc_attr( (string) round( ( $number / $largest ) * 100, 2 ) ),
				'' === $color ? '' : esc_attr( ';--reports-row-color:' . $color ),
				esc_html( Format::share( $row, $number, (float) $total ) ),
				esc_html( Format::value( $row['value'] ?? 0, $format, $currency ) )
			);
		}
	}

	/**
	 * The small picture a row can carry: a country's flag, a product's
	 * thumbnail, the logo of where a visit came from.
	 *
	 * A row's label and value are escaped, so a picture cannot arrive inside
	 * either, and letting markup through for the sake of one image would be
	 * letting everything through. So the row says where the picture is --
	 * `icon`, a URL -- and the image is written here: before the label of a
	 * breakdown row, before the value of a stat row. It is decoration, the
	 * words beside it already saying what it shows, so its alternative text
	 * is empty; and its size is stated, so the row does not move when it
	 * arrives. reports.js builds the same element after a refresh.
	 *
	 * `icon` can name an icon instead of a picture -- `heroicons-outline:globe-alt`
	 * -- which is drawn as inline SVG at the same 16px.
	 *
	 * @param array<string, mixed> $row The row.
	 *
	 * @return string The image, escaped, or nothing for a row without one.
	 */
	private static function row_icon( array $row ): string {
		$glyph = Format::row_glyph( $row['icon'] ?? '' );

		if ( '' !== $glyph ) {
			return $glyph;
		}

		$url = esc_url( (string) ( $row['icon'] ?? '' ) );

		return '' === $url
			? ''
			: sprintf( '<img class="reports-row-icon" src="%s" width="16" height="16" alt="" loading="lazy" decoding="async" />', $url );
	}

	/**
	 * Label and value rows in a panel.
	 *
	 * The place for the dozen secondary numbers that do not each deserve a
	 * tile of their own — average order value, refund rate, items per order.
	 * A row of fifteen tiles is not fifteen times as informative as one tile;
	 * it is a wall, and the number somebody actually wanted is in it
	 * somewhere.
	 *
	 * @param string               $component_id The component.
	 * @param array<string, mixed> $component    Its configuration.
	 *
	 * @return void
	 */
	protected function render_stat_list( string $component_id, array $component ): void {
		$width = $this->get_width_class( (string) ( $component['width'] ?? 'full' ) );
		$rows  = (array) ( $this->component_data( $component )['rows'] ?? [] );

		?>
		<div class="reports-stat-list-wrapper <?php echo esc_attr( $width . ' ' . ( $component['class'] ?? '' ) ); ?>"
			data-component-id="<?php echo esc_attr( $component_id ); ?>"
			data-component-type="stat_list">
			<?php if ( ! empty( $component['title'] ) ) : ?>
				<h3 class="reports-stat-list-title"><?php echo esc_html( $component['title'] ); ?></h3>
			<?php endif; ?>

			<dl class="reports-stat-list">
				<?php $this->render_stat_rows( $rows, $component ); ?>
			</dl>

			<?php // A title over nothing is an empty card: said, as a breakdown says it. ?>
			<p class="reports-empty"<?php echo [] === $rows && [] === (array) ( $component['rows'] ?? [] ) ? '' : ' hidden'; ?>>
				<?php echo esc_html( (string) ( $component['empty_message'] ?? __( 'No data available', 'sugarcommerce' ) ) ); ?>
			</p>
		</div>
		<?php
	}

	/**
	 * The rows of a stat list.
	 *
	 * A definition list, because that is what it is: each row is a term and
	 * the thing it is defined as. A table would need a header row saying
	 * "Name" and "Value", which tells the reader nothing they did not know.
	 *
	 * @param array<int, mixed>    $rows      Rows to draw.
	 * @param array<string, mixed> $component Its configuration.
	 *
	 * @return void
	 */
	protected function render_stat_rows( array $rows, array $component ): void {
		$rows = [] === $rows ? (array) ( $component['rows'] ?? [] ) : $rows;

		$currency = (string) ( $component['currency'] ?? 'USD' );

		foreach ( $rows as $row ) {
			$row = (array) $row;

			printf(
				'<div class="reports-stat-row"><dt>%s</dt><dd>%s%s</dd></div>',
				esc_html( (string) ( $row['label'] ?? '' ) ),
				// Before the value and not the term: in "Top country: Japan"
				// the flag is Japan's, not the question's.
				self::row_icon( $row ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				esc_html(
					Format::value(
						$row['value'] ?? '',
						(string) ( $row['format'] ?? $component['value_format'] ?? 'number' ),
						$currency
					)
				)
			);
		}
	}
}
