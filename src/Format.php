<?php
/**
 * Value Formatting
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2025, ArrayPress Limited
 * @license     GPL2+
 * @since       1.0.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports;

use SugarCommerce\Dates\Site;
use SugarCommerce\Fields\Icons\Icons;
use SugarCommerce\Money\Currencies;
use SugarCommerce\Money\Money;
use SugarCommerce\Text\Numbers;

/**
 * How a report shows a number.
 *
 * There were two of these: one for the page and one for the REST response the
 * auto-refresh replaces it with. They had drifted, so a tile read 1,204.50 on
 * load and 1,204 thirty seconds later — the number appeared to change on its
 * own, which is the worst way for a dashboard to be wrong.
 *
 * A report is read rather than edited, so a formatting mistake does not throw.
 * It prints a plausible wrong number and nobody notices until somebody
 * reconciles it against something else.
 */
final class Format {

	/**
	 * The arrow a change is shown with, by direction.
	 */
	public const CHANGE_ICONS = [
		'up'      => 'heroicons-outline:arrow-up',
		'down'    => 'heroicons-outline:arrow-down',
		'neutral' => 'heroicons-outline:minus',
	];

	/**
	 * The icon a tile has when it names none.
	 */
	public const TILE_ICON = 'heroicons-outline:chart-bar';

	/**
	 * A value, in the format a component asked for.
	 *
	 * @param mixed  $value    The value.
	 * @param string $format   currency, percentage, number, decimal, date, datetime.
	 * @param string $currency Currency code, for the money one.
	 *
	 * @return string
	 */
	public static function value( $value, string $format, string $currency = 'USD' ): string {
		switch ( $format ) {
			case 'currency':
				return Money::format( self::minor_units( $value, $currency ), [ 'currency' => $currency ] );

			case 'percentage':
				return Numbers::percent_i18n( (float) $value, 1 );

			case 'number':
				// Decimals only when there are some: a count of orders
				// reading 1,204.00 is what this avoids.
				return self::has_fraction( $value )
					? number_format_i18n( (float) $value, 2 )
					: number_format_i18n( (int) $value );

			case 'decimal':
				return number_format_i18n( (float) $value, 2 );

			case 'date':
				return Site::format( $value );

			case 'datetime':
				return Site::format_datetime( $value );

			default:
				// Not empty: a report naming a format that does not exist
				// should still show its number, so the mistake reads as a
				// missing currency symbol rather than a missing metric.
				return (string) $value;
		}
	}

	/**
	 * A change, with its sign.
	 *
	 * Null rather than zero when there is nothing to compare against: a
	 * period with no previous one has no change, and printing 0.0% would
	 * claim it held steady.
	 *
	 * @param mixed $change The change, as a percentage.
	 *
	 * @return string
	 */
	public static function change( $change ): string {
		if ( null === $change || '' === $change ) {
			return '';
		}

		return ( $change > 0 ? '+' : '' ) . number_format_i18n( (float) $change, 1 ) . '%';
	}

	/**
	 * An icon, ready to print.
	 *
	 * Every icon this library draws comes through here, whether a report
	 * handed it over (a tile's, a section's, a row's) or it is one of the
	 * library's own (the arrow beside a change, the caret on the date
	 * picker). Two forms are read: `set:name` from the icon sets of sugarcommerce/fields
	 * (`heroicons-outline:key`), drawn as inline SVG in the colour of the
	 * text around it; and a bare Dashicons name (`admin-network` or
	 * `dashicons-admin-network`), drawn as the font's span it always was.
	 *
	 * Either way the element carries `sugarcommerce-icon` and the class asked
	 * for, which is what the stylesheet sizes. Anything else -- a typo, a
	 * URL, markup -- draws nothing rather than a broken class.
	 *
	 * @param mixed                $value A `set:name` value or a Dashicons name.
	 * @param array<string, mixed> $args  `size` (pixels), `class`, `label`.
	 *
	 * @return string Safe markup, or ''.
	 */
	public static function icon( mixed $value, array $args = [] ): string {
		return Icons::render( $value, $args );
	}

	/**
	 * A row's icon, where it names one rather than giving a picture's URL.
	 *
	 * Only the `set:name` form: a row's `icon` has always been a URL, and a
	 * bare word there is a relative address, not a Dashicon.
	 *
	 * @param mixed $value The row's `icon`.
	 *
	 * @return string Inline SVG at 16px, escaped, or '' for a URL or nothing.
	 */
	public static function row_glyph( mixed $value ): string {
		if ( ! Icons::is_set_value( $value ) ) {
			return '';
		}

		return self::icon(
			$value,
			[
				'size'  => 16,
				'class' => 'reports-row-icon',
			]
		);
	}

	/**
	 * The arrow beside a change, for the way it went.
	 *
	 * @param string $direction up, down or neutral; anything else is neutral.
	 *
	 * @return string Safe markup.
	 */
	public static function change_icon( string $direction ): string {
		return self::icon( self::CHANGE_ICONS[ $direction ] ?? self::CHANGE_ICONS['neutral'] );
	}

	/**
	 * An amount in minor units, however it arrived.
	 *
	 * A whole number is already minor units — 9900 is ninety-nine pounds. A
	 * number written with a decimal point is a decimal amount, and 99.00 is
	 * the same ninety-nine pounds.
	 *
	 * The distinction used to be `is_float()`, which asks PHP what type the
	 * value is rather than what the value says. `$wpdb` returns every column
	 * as a string, so `SUM(total)` on a DECIMAL column arrives as `'99.00'` —
	 * not a float, so it was cast straight to 99 and a revenue tile read
	 * $0.99. A hundredfold error, on a number nobody would think to check.
	 *
	 * A decimal amount is scaled by the currency's own places: 99.00 yen is
	 * 99, not 9900, and 1.5 dinars is 1500 fils. Without a currency it is
	 * two places, as most are.
	 *
	 * @param mixed  $value    The amount.
	 * @param string $currency Its currency code, for its decimal places.
	 *
	 * @return int
	 */
	public static function minor_units( $value, string $currency = '' ): int {
		if ( ! is_numeric( $value ) ) {
			return 0;
		}

		if ( ! self::is_decimal_amount( $value ) ) {
			return (int) $value;
		}

		$places = '' === $currency ? 2 : Currencies::decimals( $currency );

		return (int) round( (float) $value * ( 10 ** $places ) );
	}

	/**
	 * Whether an amount was written as a decimal rather than as minor units.
	 *
	 * Not "has a non-zero fraction": 99.00 is a decimal amount whose fraction
	 * happens to be nought, and reading it as minor units gives 99p.
	 *
	 * Both halves are needed because the two origins look different. A float
	 * is a decimal by construction — but PHP casts 99.00 to the string "99",
	 * so looking for a point would miss it. A string comes from `$wpdb`,
	 * which returns every column as one, so `'99.00'` keeps its point and its
	 * type says nothing.
	 *
	 * @param mixed $value The amount.
	 *
	 * @return bool
	 */
	private static function is_decimal_amount( $value ): bool {
		return is_float( $value ) || str_contains( (string) $value, '.' );
	}

	/**
	 * Whether a value has digits after the point that matter.
	 *
	 * A different question from the one above, and only used for deciding
	 * whether to print decimals: 1204.0 is a whole number however it is
	 * typed, and a count of orders reading 1,204.00 is what this avoids.
	 *
	 * @param mixed $value The value.
	 *
	 * @return bool
	 */
	private static function has_fraction( $value ): bool {
		return is_numeric( $value ) && 0.0 !== fmod( (float) $value, 1.0 );
	}

	/**
	 * A row's share of the whole, as the text to print.
	 *
	 * The rows of a ranked list are usually the top few of many, and the sum
	 * of the rows shown is not the whole: the best of five sources is not
	 * 41% of revenue because it is 41% of the five. So a row may say what
	 * its share is -- a number, or the finished text -- and only a row that
	 * does not is worked out against the rows beside it.
	 *
	 * @param array<string, mixed> $row   The row.
	 * @param float                $value Its value.
	 * @param float                $total The sum of the rows shown.
	 *
	 * @return string
	 */
	public static function share( array $row, float $value, float $total ): string {
		$stated = $row['share'] ?? null;

		if ( is_string( $stated ) && '' !== $stated && ! is_numeric( $stated ) ) {
			return $stated;
		}

		$percent = is_numeric( $stated )
			? (float) $stated
			: ( $total > 0 ? ( $value / $total ) * 100 : 0.0 );

		return Numbers::percent_i18n( $percent, 1 );
	}
}
