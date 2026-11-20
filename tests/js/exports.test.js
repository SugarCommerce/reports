/**
 * CSV exports: the filters a card's fields say, the start and the batches,
 * the bar, the download, and what a failure says.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { gatherExportFilters } from '../../assets/js/reports/exports';
import { cleanup, click, layout, SETTINGS, startReport } from './support/page';

beforeEach( () => {
	layout();
	vi.useFakeTimers();
} );

afterEach( () => {
	cleanup();
	vi.useRealTimers();
} );

const $ = ( selector ) => document.querySelector( selector );

/**
 * What the card shows.
 *
 * @return {Object} The bar, its words and the button.
 */
const card = () => ( {
	shown: $( '.reports-export-progress' ).style.display !== 'none',
	width: $( '.reports-export-progress-fill' ).style.width,
	label: $( '.reports-export-progress-label' ).textContent,
	error: $( '.reports-export-progress-label' ).classList.contains( 'error' ),
	percent: $( '.reports-export-progress-percent' ).textContent,
	disabled: $( '.reports-export-button' ).disabled,
	button: $( '.reports-export-button .button-text' ).textContent,
} );

describe( "a card's filters", () => {
	test( 'by name without filter_, each kind as a form sends it', () => {
		document.body.innerHTML = `<div class="reports-export-card">
			<input class="reports-filter-input" type="checkbox" name="filter_gateway[]" value="stripe" checked>
			<input class="reports-filter-input" type="checkbox" name="filter_gateway[]" value="paypal">
			<input class="reports-filter-input" type="checkbox" name="filter_none[]" value="x">
			<select class="reports-filter-input" name="filter_status[]" multiple>
				<option value="a" selected>A</option><option value="b">B</option><option value="c" selected disabled>C</option>
				<optgroup disabled><option value="d" selected>D</option></optgroup><option selected> E  e </option>
			</select>
			<select class="reports-filter-input" name="filter_empty" multiple><option value="z">Z</option></select>
			<select class="reports-filter-input" name="country"><option value="GB" selected>UK</option></select>
			<input class="reports-filter-input" type="text" name="filter_q" value="">
			<input class="reports-filter-input" type="text" name="filter_min" value="5">
			<textarea class="reports-filter-input" name="filter_note">a\r\nb</textarea>
			<input class="reports-filter-input" type="text" value="no name">
			<input type="text" name="filter_not_a_filter" value="x">
		</div>`;

		expect( gatherExportFilters( $( '.reports-export-card' ) ) ).toEqual( {
			gateway: [ 'stripe' ],
			none: [],
			status: [ 'a', 'E e' ],
			empty: [],
			country: 'GB',
			min: '5',
			note: 'a\nb',
		} );
	} );

	test( 'no card, no filters', () => {
		expect( gatherExportFilters( null ) ).toEqual( {} );
	} );
} );

describe( 'an export', () => {
	const href =
		'https://example.test/wp-admin/admin.php?page=reports&tab=exports&date_preset=custom&date_start=2026-01-01&date_end=2026-01-31';

	test( 'starts, writes batch by batch, then downloads', async () => {
		const batches = [
			{ success: true, processed_items: 50, total_items: 120 },
			{ success: true, processed_items: 100, total_items: 120 },
			{
				success: true,
				processed_items: 120,
				total_items: 120,
				is_complete: true,
				download_url: 'https://example.test/download?token=t',
			},
		];
		const { apiFetch, navigated } = startReport( {
			href,
			routes: {
				'export/start': () => ( {
					success: true,
					export_token: 'tok',
					total_items: 120,
					batch_size: 50,
				} ),
				'export/batch': () => batches.shift(),
			},
		} );

		click( $( '.reports-export-button' ) );

		expect( card() ).toEqual( {
			shown: true,
			width: '0%',
			label: 'Preparing export...',
			error: false,
			percent: '0%',
			disabled: true,
			button: 'Exporting...',
		} );

		await vi.advanceTimersByTimeAsync( 0 );

		expect( apiFetch.calls.map( ( c ) => [ c.url, c.body ] ) ).toEqual( [
			[
				SETTINGS.restUrl + 'export/start',
				JSON.stringify( {
					report_id: 'sales',
					export_id: 'orders',
					filters: { status: 'complete' },
					date_preset: 'custom',
					date_start: '2026-01-01',
					date_end: '2026-01-31',
				} ),
			],
			[
				SETTINGS.restUrl + 'export/batch',
				'{"export_token":"tok","batch":0}',
			],
			[
				SETTINGS.restUrl + 'export/batch',
				'{"export_token":"tok","batch":1}',
			],
			[
				SETTINGS.restUrl + 'export/batch',
				'{"export_token":"tok","batch":2}',
			],
		] );
		apiFetch.calls.forEach( ( c ) => {
			expect( c.method ).toBe( 'POST' );
			expect( c.headers ).toEqual( {
				'X-WP-Nonce': SETTINGS.restNonce,
				'Content-Type': 'application/json',
			} );
		} );

		expect( card() ).toMatchObject( {
			width: '100%',
			label: 'Export complete!',
			percent: '100%',
			disabled: true,
		} );
		expect( navigated ).toEqual( [] );

		await vi.advanceTimersByTimeAsync( 500 );

		expect( navigated ).toEqual( [
			'https://example.test/download?token=t',
		] );
		expect( card() ).toEqual( {
			shown: false,
			width: '100%',
			label: 'Export complete!',
			error: false,
			percent: '100%',
			disabled: false,
			button: 'Download CSV',
		} );
	} );

	test( 'the bar follows the batches', async () => {
		let release;
		startReport( {
			routes: {
				'export/start': () => ( { success: true, export_token: 't' } ),
				'export/batch': ( request ) =>
					JSON.parse( request.body ).batch === 0
						? { success: true, processed_items: 1, total_items: 3 }
						: new Promise( ( resolve ) => {
								release = resolve;
							} ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );

		expect( card() ).toMatchObject( {
			width: '33%',
			percent: '33%',
			label: 'Processing 1 / 3',
		} );

		release( { success: false, message: 'Disk full.' } );
		await vi.advanceTimersByTimeAsync( 0 );

		expect( card() ).toMatchObject( {
			label: 'Error: Disk full.',
			error: true,
			disabled: true,
		} );

		await vi.advanceTimersByTimeAsync( 3000 );

		expect( card() ).toMatchObject( {
			shown: false,
			error: false,
			disabled: false,
			button: 'Download CSV',
		} );
	} );

	test( 'a start the server refuses says why', async () => {
		startReport( {
			routes: {
				'export/start': () =>
					Promise.reject( {
						code: 'no_data',
						message: 'No data to export.',
						data: { status: 400 },
					} ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );

		expect( card().label ).toBe( 'Error: No data to export.' );
	} );

	test( 'a start that fails without an answer, or says no', async () => {
		startReport( {
			routes: {
				'export/start': () => Promise.reject( { code: 'fetch_error' } ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Export failed' );

		cleanup();
		startReport( {
			routes: { 'export/start': () => ( { success: false } ) },
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Export failed' );

		cleanup();
		startReport( {
			routes: {
				'export/start': () => ( { success: false, message: 'Busy.' } ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Busy.' );
	} );

	test( 'a batch that fails without an answer, or says no without a reason', async () => {
		startReport( {
			routes: {
				'export/start': () => ( { success: true, export_token: 't' } ),
				'export/batch': () => Promise.reject( { code: 'fetch_error' } ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Batch failed' );

		cleanup();
		startReport( {
			routes: {
				'export/start': () => ( { success: true, export_token: 't' } ),
				'export/batch': () => ( { success: false } ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Batch failed' );

		cleanup();
		startReport( {
			routes: {
				'export/start': () => ( { success: true, export_token: 't' } ),
				'export/batch': () =>
					Promise.reject( {
						code: 'x',
						message: 'Gone.',
						data: { status: 410 },
					} ),
			},
		} );

		click( $( '.reports-export-button' ) );
		await vi.advanceTimersByTimeAsync( 0 );
		expect( card().label ).toBe( 'Error: Gone.' );
	} );

	test( 'a button already busy does nothing', async () => {
		const { apiFetch } = startReport();

		$( '.reports-export-button' ).disabled = true;
		$( '.reports-export-button' ).dispatchEvent(
			new window.MouseEvent( 'click', { bubbles: true } )
		);
		await vi.advanceTimersByTimeAsync( 0 );

		expect( apiFetch ).not.toHaveBeenCalled();
		expect( card().shown ).toBe( false );
	} );
} );
