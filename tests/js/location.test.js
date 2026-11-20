/**
 * Reading the request back from the address, and writing a new period
 * into it.
 */

import { describe, expect, test } from 'vitest';

import {
	currentEnd,
	currentFilters,
	currentPreset,
	currentStart,
	currentTab,
	rangeUrl,
} from '../../src/js/reports/location';

const BASE = 'https://example.test/wp-admin/admin.php?page=reports';

describe( 'reading the address', () => {
	const href =
		BASE +
		'&tab=sales&date_preset=last_30&date_start=2026-01-01&date_end=2026-01-31' +
		'&filter_status=complete&filter_gateway=stripe&orderby=name';

	test( 'the tab, the period and its days', () => {
		expect( currentTab( href ) ).toBe( 'sales' );
		expect( currentPreset( href, 'last_7' ) ).toBe( 'last_30' );
		expect( currentStart( href ) ).toBe( '2026-01-01' );
		expect( currentEnd( href ) ).toBe( '2026-01-31' );
	} );

	test( 'every filter_ argument, and nothing else', () => {
		expect( currentFilters( href ) ).toEqual( {
			filter_status: 'complete',
			filter_gateway: 'stripe',
		} );
	} );

	test( 'a multiselect is gathered into a list', () => {
		// Read one at a time, each repeat overwrote the last and the
		// refresh carried one status where the page showed two.
		expect(
			currentFilters(
				BASE +
					'&filter_status%5B%5D=complete&filter_status%5B%5D=refunded&filter_gateway=stripe'
			)
		).toEqual( {
			filter_status: [ 'complete', 'refunded' ],
			filter_gateway: 'stripe',
		} );
	} );

	test( 'none of it invents a value', () => {
		expect( currentTab( BASE ) ).toBe( '' );
		expect( currentStart( BASE ) ).toBe( '' );
		expect( currentEnd( BASE ) ).toBe( '' );
		expect( currentFilters( BASE ) ).toEqual( {} );
	} );

	test( "a missing preset is the report's own default, then this_month", () => {
		expect( currentPreset( BASE, 'last_7' ) ).toBe( 'last_7' );
		expect( currentPreset( BASE, '' ) ).toBe( 'this_month' );
		expect( currentPreset( BASE ) ).toBe( 'this_month' );
	} );
} );

describe( 'a new period', () => {
	test( 'a preset drops a custom range', () => {
		const url = new URL(
			rangeUrl(
				BASE +
					'&tab=sales&date_preset=custom&date_start=2026-01-01&date_end=2026-01-31',
				'last_7'
			)
		);

		expect( url.searchParams.get( 'date_preset' ) ).toBe( 'last_7' );
		expect( url.searchParams.has( 'date_start' ) ).toBe( false );
		expect( url.searchParams.has( 'date_end' ) ).toBe( false );
		expect( url.searchParams.get( 'tab' ) ).toBe( 'sales' );
	} );

	test( 'a custom range carries both days', () => {
		const url = new URL(
			rangeUrl( BASE, 'custom', '2026-02-01', '2026-02-10' )
		);

		expect( url.searchParams.get( 'date_preset' ) ).toBe( 'custom' );
		expect( url.searchParams.get( 'date_start' ) ).toBe( '2026-02-01' );
		expect( url.searchParams.get( 'date_end' ) ).toBe( '2026-02-10' );
	} );

	test( 'days given with a preset are not written', () => {
		const url = new URL(
			rangeUrl( BASE, 'last_7', '2026-02-01', '2026-02-10' )
		);

		expect( url.searchParams.has( 'date_start' ) ).toBe( false );
		expect( url.searchParams.has( 'date_end' ) ).toBe( false );
	} );

	test( 'a custom range missing a day carries neither', () => {
		const url = new URL(
			rangeUrl(
				BASE + '&date_start=2026-01-01',
				'custom',
				'2026-02-01',
				''
			)
		);

		expect( url.searchParams.has( 'date_start' ) ).toBe( false );
		expect( url.searchParams.has( 'date_end' ) ).toBe( false );
	} );
} );
