<?php
/**
 * Export batches that page by key.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Tests;

use SugarCommerce\Reports\Registry;
use SugarCommerce\Reports\Reports;
use SugarCommerce\Reports\RestApi;
use SugarCommerce\Reports\Utils\Runtime;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

/**
 * A big export read by OFFSET counts its way past every row before the
 * batch, and gets slower the further it goes. A data callback that answers
 * `rows` and a `cursor` is handed that cursor back as `after` on the next
 * batch; one that answers plain rows is paged by offset as it always was.
 */
final class ExportBatchTest extends TestCase {

	/**
	 * What each batch's callback was handed.
	 *
	 * @var array<int, array<string, mixed>>
	 */
	private array $asked = [];

	/**
	 * The file written.
	 *
	 * @var string
	 */
	private string $path = '';

	protected function setUp(): void {
		$GLOBALS['rp_transients'] = [];
		$this->path               = (string) tempnam( sys_get_temp_dir(), 'rp-export' );
	}

	protected function tearDown(): void {
		unset( $GLOBALS['rp_transients'] );

		Registry::instance()->unregister( 'takings' );

		if ( is_file( $this->path ) ) {
			unlink( $this->path );
		}
	}

	/**
	 * Ten rows, ids 1 to 10, read four at a time.
	 *
	 * @param bool $keyed Whether the callback answers a cursor.
	 *
	 * @return void
	 */
	private function report( bool $keyed ): void {
		new Reports(
			'takings',
			[
				'exports' => [
					'orders' => [
						'batch_size'     => 4,
						'total_callback' => static fn(): int => 10,
						'data_callback'  => function ( array $args ) use ( $keyed ): array {
							$this->asked[] = $args;

							$after = $args['after'] ?? null;
							$ids   = range( 1, 10 );
							$ids   = null === $after ? array_slice( $ids, (int) $args['offset'] ) : array_values( array_filter( $ids, static fn( int $id ): bool => $id > (int) $after ) );
							$rows  = array_map( static fn( int $id ): array => [ 'id' => $id ], array_slice( $ids, 0, (int) $args['limit'] ) );

							return $keyed ? [ 'rows' => $rows, 'cursor' => [] === $rows ? null : end( $rows )['id'] ] : $rows;
						},
					],
				],
			]
		);

		set_transient(
			Runtime::key( 'export' ) . '_a-token',
			[
				'report_id'   => 'takings',
				'export_id'   => 'orders',
				'filters'     => [],
				'date_range'  => [],
				'file_path'   => $this->path,
				'total_items' => 10,
				'headers'     => [ 'id' => 'ID' ],
			]
		);
	}

	/**
	 * Run batches until the export says it is complete.
	 *
	 * @return array<int, array<string, mixed>> Each batch's answer.
	 */
	private function run_batches(): array {
		$answers = [];

		for ( $batch = 0; $batch < 10; $batch++ ) {
			$request = new WP_REST_Request( 'POST', '/export/batch' );
			$request->set_param( 'export_token', 'a-token' );
			$request->set_param( 'batch', $batch );

			$answer    = RestApi::process_export_batch( $request )->get_data();
			$answers[] = $answer;

			if ( $answer['is_complete'] ) {
				break;
			}
		}

		return $answers;
	}

	public function test_a_cursor_is_handed_back_as_after(): void {
		$this->report( true );

		$answers = $this->run_batches();

		$this->assertSame( [ null, 4, 8 ], array_column( $this->asked, 'after' ) );
		$this->assertSame( [ 4, 8, 10 ], array_column( $answers, 'processed_items' ) );
		$this->assertTrue( end( $answers )['is_complete'] );

		// Every row once, in order.
		$lines = array_map( 'trim', (array) file( $this->path ) );
		$this->assertSame( [ '1', '2', '3', '4', '5', '6', '7', '8', '9', '10' ], array_slice( $lines, 1 ) );
	}

	public function test_plain_rows_are_paged_by_offset(): void {
		$this->report( false );

		$this->run_batches();

		$this->assertSame( [ 0, 4, 8 ], array_column( $this->asked, 'offset' ) );
		$this->assertSame( [ null, null, null ], array_column( $this->asked, 'after' ) );
	}

	public function test_an_export_says_how_many_rows_a_request(): void {
		$this->assertSame( 1000, RestApi::BATCH_SIZE );
	}
}
