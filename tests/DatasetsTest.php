<?php
/**
 * Dataset builder tests.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Datasets;
use PHPUnit\Framework\TestCase;

/**
 * The datasets a data callback returns.
 *
 * Small, and each rule here is one a report gets visibly wrong without it:
 * a month that falls to the floor at today, a rainbow of bars, a best bar
 * picked out of a row of noughts.
 */
final class DatasetsTest extends TestCase {

	public function test_a_line_is_monotone_and_keeps_its_colour(): void {
		$line = Datasets::line( 'Net revenue', [ 'a' => 1, 'b' => 2 ], '#3858e9', [ 'yAxisID' => 'y1' ] );

		$this->assertSame( 'line', $line['type'] );
		$this->assertSame( [ 1, 2 ], $line['data'] );
		$this->assertSame( 'monotone', $line['cubicInterpolationMode'] );
		$this->assertSame( '#3858e9', $line['borderColor'] );
		$this->assertSame( 'y1', $line['yAxisID'] );
	}

	/**
	 * No colour leaves it to the report's palette.
	 */
	public function test_no_colour_leaves_the_palette_to_choose(): void {
		$this->assertArrayNotHasKey( 'borderColor', Datasets::line( 'A', [ 1 ] ) );
		$this->assertArrayNotHasKey( 'backgroundColor', Datasets::bars( 'A', [ 1 ] ) );
	}

	/**
	 * The tallest in the colour, the rest in its tint -- ties too.
	 */
	public function test_the_tallest_bar_is_picked_out(): void {
		$this->assertSame( [ 'tint', 'brand', 'tint', 'brand' ], Datasets::highlight( [ 1, '3', 2, 3.0 ], 'brand', 'tint' ) );
	}

	/**
	 * A row of noughts has no best.
	 */
	public function test_nothing_is_picked_out_of_nothing(): void {
		$this->assertSame( [ 'tint', 'tint' ], Datasets::highlight( [ 0, 0 ], 'brand', 'tint' ) );
		$this->assertSame( [], Datasets::highlight( [], 'brand', 'tint' ) );
	}

	public function test_a_colour_per_bar_is_kept(): void {
		$bars = Datasets::bars( 'Sales', [ 1, 2 ], [ 'x' => 'tint', 'y' => 'brand' ] );

		$this->assertSame( [ 'tint', 'brand' ], $bars['backgroundColor'] );
	}

	/**
	 * Bars while they can be counted, a line once there are more.
	 */
	public function test_over_time_is_bars_then_a_line(): void {
		$this->assertSame( 'bar', Datasets::over_time( 'Sales', array_fill( 0, 12, 1 ) )['type'] );
		$this->assertSame( 'line', Datasets::over_time( 'Sales', array_fill( 0, 13, 1 ) )['type'] );
		$this->assertSame( 'bar', Datasets::over_time( 'Sales', array_fill( 0, 13, 1 ), [ 'bars_max' => 13 ] )['type'] );
		$this->assertSame( '#111', Datasets::over_time( 'Sales', [ 1 ], [ 'colour' => '#111' ] )['backgroundColor'] );
	}

	/**
	 * What has not started is a gap, not a nought.
	 */
	public function test_a_bucket_that_has_not_started_is_a_gap(): void {
		$this->assertSame( [ 5, 6, null ], Datasets::so_far( [ 5, 6, 7 ], [ 100, 200, 300 ], 200 ) );

		$over = Datasets::over_time( 'Sales', [ 5, 6, 7 ], [ 'starts' => [ 100, 200, 300 ], 'now' => 250 ] );

		$this->assertSame( [ 5, 6, null ], $over['data'] );
	}
}
