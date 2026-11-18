<?php
/**
 * Datasets
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports;

/**
 * The datasets a chart's data callback returns, built the way the report
 * draws them.
 *
 * Only what a dataset has to say for itself: its type, its colour, and the
 * curve of a line. The fade under a line, its width, the dot under the
 * pointer, the rounding of a bar and the rest are the report's script, and
 * are left to it -- so a chart built from these looks like every other.
 *
 * Every method returns a plain array, and anything in `$extra` is laid over
 * it, so a key Chart.js has that these do not ask for is one argument away.
 */
final class Datasets {

	/**
	 * How many buckets are drawn as bars before a series becomes a line.
	 *
	 * The months of a year.
	 */
	public const BARS_MAX = 12;

	/**
	 * A line with a fade under it.
	 *
	 * Two of them over each other -- an amount and a count, sales and
	 * earnings -- each fade from their own colour. Give the second
	 * `[ 'yAxisID' => 'y1' ]` and the component a `secondary_axis` to read
	 * it off its own scale.
	 *
	 * @param string               $label  What it is.
	 * @param array<int, mixed>    $data   A value for each bucket; null for
	 *                                     a gap.
	 * @param string               $colour The line's colour, as hex: the
	 *                                     script makes the fade from it.
	 *                                     Empty for the report's palette.
	 * @param array<string, mixed> $extra  Anything else Chart.js reads.
	 *
	 * @return array<string, mixed>
	 */
	public static function line( string $label, array $data, string $colour = '', array $extra = [] ): array {
		$dataset = [
			'type'                   => 'line',
			'label'                  => $label,
			'data'                   => array_values( $data ),

			// A curve that never dips below the points either side of it,
			// which a plain one does and reads as a loss.
			'cubicInterpolationMode' => 'monotone',
		];

		if ( '' !== $colour ) {
			$dataset['borderColor'] = $colour;
		}

		return array_merge( $dataset, $extra );
	}

	/**
	 * Bars.
	 *
	 * @param string                    $label  What it is.
	 * @param array<int, mixed>         $data   A value for each bar.
	 * @param string|array<int, string> $colour One colour, a colour for each
	 *                                          bar (see highlight()), or
	 *                                          empty for the report's
	 *                                          palette.
	 * @param array<string, mixed>      $extra  Anything else Chart.js reads.
	 *
	 * @return array<string, mixed>
	 */
	public static function bars( string $label, array $data, string|array $colour = '', array $extra = [] ): array {
		$dataset = [
			'type'  => 'bar',
			'label' => $label,
			'data'  => array_values( $data ),
		];

		if ( '' !== $colour && [] !== $colour ) {
			$dataset['backgroundColor'] = is_array( $colour ) ? array_values( $colour ) : $colour;
		}

		return array_merge( $dataset, $extra );
	}

	/**
	 * A colour for each bar, picking out the tallest.
	 *
	 * For a chart whose point is which one is best: the tallest in the
	 * colour and the rest in its tint. Every bar the tallest ties with is
	 * picked out too. When none has anything, all are the tint -- a
	 * highlighted nought is not a best.
	 *
	 * @param array<int, mixed> $data   A value for each bar.
	 * @param string            $colour The tallest bar's colour.
	 * @param string            $tint   Every other bar's.
	 *
	 * @return array<int, string>
	 */
	public static function highlight( array $data, string $colour, string $tint ): array {
		$values = array_map( 'floatval', array_values( $data ) );
		$best   = [] === $values ? 0.0 : max( $values );

		return array_map(
			static fn( float $value ): string => $best > 0 && $value === $best ? $colour : $tint,
			$values
		);
	}

	/**
	 * A figure over the buckets of a period, as bars or as a line.
	 *
	 * Bars while there are few enough buckets to count -- the weeks of a
	 * month, the months of a year -- and a line once there are more, when
	 * it is the shape that is being read and not each bar. The chart takes
	 * its type from its first dataset, so this decides the chart too.
	 *
	 * With `starts`, the buckets that have not begun are emptied (see
	 * so_far()).
	 *
	 * @param string               $label What it is.
	 * @param array<int, mixed>    $data  A value for each bucket.
	 * @param array<string, mixed> $args  {
	 *     Optional.
	 *
	 *     @type string   $colour   The colour. Empty for the report's palette.
	 *     @type int      $bars_max The most buckets drawn as bars.
	 *     @type int[]    $starts   When each bucket starts, as timestamps.
	 *     @type int|null $now      What "now" is, for so_far(). Defaults to time().
	 * }
	 *
	 * @return array<string, mixed>
	 */
	public static function over_time( string $label, array $data, array $args = [] ): array {
		$colour = (string) ( $args['colour'] ?? $args['color'] ?? '' );

		if ( isset( $args['starts'] ) ) {
			$data = self::so_far( $data, (array) $args['starts'], $args['now'] ?? null );
		}

		if ( count( $data ) <= (int) ( $args['bars_max'] ?? self::BARS_MAX ) ) {
			return self::bars( $label, $data, $colour );
		}

		return self::line( $label, $data, $colour );
	}

	/**
	 * A value for each bucket, with the buckets that have not started
	 * emptied.
	 *
	 * Nothing has happened yet in a bucket that has not started. Drawn as
	 * nought, the rest of this month is a line falling to the floor; drawn
	 * as a gap, it is a line that stops at today.
	 *
	 * @param array<int, mixed> $data   A value for each bucket.
	 * @param array<int, int>   $starts When each bucket starts, as
	 *                                  timestamps, in the same order.
	 * @param int|null          $now    What "now" is. Defaults to time().
	 *
	 * @return array<int, mixed>
	 */
	public static function so_far( array $data, array $starts, ?int $now = null ): array {
		$data   = array_values( $data );
		$starts = array_values( $starts );
		$now    = $now ?? time();

		foreach ( array_keys( $data ) as $at ) {
			if ( (int) ( $starts[ $at ] ?? 0 ) > $now ) {
				$data[ $at ] = null;
			}
		}

		return $data;
	}
}
