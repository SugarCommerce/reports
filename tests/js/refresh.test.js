/**
 * Refreshing in place: what is asked for, what is drawn from the answer,
 * the busy state, and the report's own interval.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { translator } from '../../assets/js/lib/text';
import { updatedText } from '../../assets/js/reports/refresh';
import {
	cleanup,
	click,
	FakeChart,
	flush,
	layout,
	SETTINGS,
	startReport,
	STRINGS,
} from './support/page';

beforeEach( layout );
afterEach( () => {
	cleanup();
	vi.useRealTimers();
} );

const $ = ( selector ) => document.querySelector( selector );

const ANSWER = {
	success: true,
	components: {
		earnings: {
			type: 'tile',
			value: 2,
			formatted_value: '$2.00',
			change: 5,
			change_direction: 'up',
		},
		over_time: {
			type: 'chart',
			labels: [ 'a', 'b' ],
			datasets: [ { label: 'Orders', data: [ 4, 5 ] } ],
		},
		orders_table: {
			type: 'table',
			rows: [ { number: 'PG-1', customer: 'Ann', total: '$1.00' } ],
		},
		countries: { type: 'breakdown', rows: [ { label: 'France' } ] },
		products: { type: 'stat_list', rows: [ { label: 'Keys' } ] },
		target: { type: 'progress', percent: 50 },
	},
};

describe( 'how long ago', () => {
	const t = translator( STRINGS );

	test( 'just now, seconds, minutes, hours', () => {
		expect( updatedText( 0, t ) ).toBe( 'Updated just now' );
		expect( updatedText( 9, t ) ).toBe( 'Updated just now' );
		expect( updatedText( 10, t ) ).toBe( 'Updated 10s ago' );
		expect( updatedText( 59, t ) ).toBe( 'Updated 59s ago' );
		expect( updatedText( 60, t ) ).toBe( 'Updated 1m ago' );
		expect( updatedText( 3599, t ) ).toBe( 'Updated 59m ago' );
		expect( updatedText( 3600, t ) ).toBe( 'Updated 1h ago' );
		expect( updatedText( 7300, t ) ).toBe( 'Updated 2h ago' );
	} );
} );

describe( 'Refresh', () => {
	test( 'asks for the page as it is, through apiFetch', async () => {
		const components = vi.fn( () => ANSWER );
		const { apiFetch } = startReport( {
			routes: { components },
			href: 'https://example.test/wp-admin/admin.php?page=reports&tab=overview&date_preset=custom&date_start=2026-01-01&date_end=2026-01-31&filter_status%5B%5D=complete&filter_status%5B%5D=refunded&filter_country=GB&other=x',
		} );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( apiFetch ).toHaveBeenCalledTimes( 1 );
		expect( apiFetch.calls[ 0 ] ).toEqual( {
			url:
				SETTINGS.restUrl +
				'components?report_id=sales&tab=overview&date_preset=custom&date_start=2026-01-01&date_end=2026-01-31&filter_status%5B%5D=complete&filter_status%5B%5D=refunded&filter_country=GB',
			method: 'GET',
			headers: { 'X-WP-Nonce': SETTINGS.restNonce },
			parse: true,
		} );
	} );

	test( "no preset in the address: the report's default", async () => {
		const { apiFetch } = startReport( {
			routes: { components: () => ANSWER },
		} );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( apiFetch.calls[ 0 ].url ).toBe(
			SETTINGS.restUrl +
				'components?report_id=sales&tab=&date_preset=last_30&date_start=&date_end='
		);
	} );

	test( 'draws every component from the answer', async () => {
		startReport( { routes: { components: () => ANSWER } } );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( $( '.reports-tile-value' ).textContent ).toBe( '$2.00' );
		expect( $( '.reports-tile-change' ).className ).toBe(
			'reports-tile-change change-up'
		);

		const chart = FakeChart.made[ 0 ];

		expect( chart.data.labels ).toEqual( [ 'a', 'b' ] );
		expect( chart.data.datasets[ 0 ].data ).toEqual( [ 4, 5 ] );
		expect( chart.updates ).toEqual( [ 'none' ] );

		expect(
			document.querySelectorAll( '.reports-table tbody tr' )
		).toHaveLength( 1 );
		expect(
			$( '.reports-table tbody td[data-column="customer"]' ).innerHTML
		).toBe( 'Ann' );
		expect( $( '.reports-breakdown' ).textContent ).toBe( 'France' );
		expect( $( '.reports-stat-list' ).textContent ).toBe( 'Keys' );
		expect( $( '.reports-progress-fill' ).style.width ).toBe( '50%' );
	} );

	test( "a table PHP described with no data-table-config keeps the page's columns", async () => {
		startReport( {
			tableConfig: false,
			routes: {
				components: () => ( {
					success: true,
					components: {
						orders_table: {
							rows: [
								{ total: '$9', number: 'PG-9', customer: 'Bo' },
							],
						},
					},
				} ),
			},
		} );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect(
			[ ...document.querySelectorAll( '.reports-table tbody td' ) ].map(
				( c ) => c.dataset.column + '=' + c.textContent
			)
		).toEqual( [ 'number=PG-9', 'customer=Bo', 'total=$9' ] );
	} );

	test( "core's busy state while it works, and the time after", async () => {
		let answer;
		const { log } = startReport( {
			routes: {
				components: () =>
					new Promise( ( resolve ) => {
						answer = resolve;
					} ),
			},
		} );
		const button = $( '.reports-refresh-button' );

		click( button );
		await flush();

		expect( button.className ).toBe(
			'button reports-refresh-button refreshing updating-message'
		);
		expect(
			$( '.reports-content' ).classList.contains(
				'reports-component-refreshing'
			)
		).toBe( true );

		// A second press while one is out sends nothing.
		click( button );
		await flush();

		answer( { success: false } );
		await flush();

		expect( button.className ).toBe( 'button reports-refresh-button' );
		expect(
			$( '.reports-content' ).classList.contains(
				'reports-component-refreshing'
			)
		).toBe( false );
		expect( $( '.reports-last-updated-text' ).textContent ).toBe(
			'Updated just now'
		);
		expect( log.error ).not.toHaveBeenCalled();
	} );

	test( 'one press at a time', async () => {
		const { apiFetch } = startReport( {
			routes: { components: () => new Promise( () => {} ) },
		} );

		click( $( '.reports-refresh-button' ) );
		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( apiFetch ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'a refusal draws nothing, is reported, and still finishes', async () => {
		const { log } = startReport( {
			routes: {
				components: () =>
					Promise.reject( {
						code: 'rest_forbidden',
						message: 'No.',
						data: { status: 403 },
					} ),
			},
		} );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( $( '.reports-tile-value' ).textContent ).toBe( '$1,136.29' );
		expect( log.error ).toHaveBeenCalledWith( 'Refresh failed:', {
			code: 'rest_forbidden',
			message: 'No.',
			data: { status: 403 },
		} );
		expect( $( '.reports-refresh-button' ).className ).toBe(
			'button reports-refresh-button'
		);
		expect( $( '.reports-last-updated-text' ).textContent ).toBe(
			'Updated just now'
		);
	} );

	test( 'an answer without components draws nothing', async () => {
		startReport( { routes: { components: () => ( { success: true } ) } } );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( $( '.reports-tile-value' ).textContent ).toBe( '$1,136.29' );
	} );

	test( 'a page with no report id sends nothing', async () => {
		const { apiFetch } = startReport( { reportId: '' } );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( apiFetch ).not.toHaveBeenCalled();
	} );

	test( 'a report id of digits is sent as it reads', async () => {
		const { apiFetch } = startReport( {
			reportId: '0042',
			routes: { components: () => ANSWER },
		} );

		click( $( '.reports-refresh-button' ) );
		await flush();

		expect( apiFetch.calls[ 0 ].url ).toContain( 'report_id=0042&' );
	} );
} );

describe( "the report's own interval", () => {
	test( 'refreshes every so often, and says how long ago', async () => {
		vi.useFakeTimers( { now: new Date( '2026-11-20T10:00:00Z' ) } );

		const { apiFetch } = startReport( {
			autoRefresh: 30,
			routes: { components: () => ANSWER },
		} );

		expect( apiFetch ).not.toHaveBeenCalled();

		vi.advanceTimersByTime( 20000 );
		expect( $( '.reports-last-updated-text' ).textContent ).toBe(
			'Updated 20s ago'
		);

		vi.advanceTimersByTime( 10000 );
		expect( apiFetch ).toHaveBeenCalledTimes( 1 );

		await vi.advanceTimersByTimeAsync( 0 );
		expect( $( '.reports-last-updated-text' ).textContent ).toBe(
			'Updated just now'
		);

		await vi.advanceTimersByTimeAsync( 30000 );
		expect( apiFetch ).toHaveBeenCalledTimes( 2 );

		await vi.advanceTimersByTimeAsync( 3600000 - 30000 );
		expect( apiFetch ).toHaveBeenCalledTimes( 121 );
	} );

	test( 'pauses while the page is out of view', () => {
		vi.useFakeTimers();

		const { apiFetch } = startReport( {
			autoRefresh: 10,
			routes: { components: () => new Promise( () => {} ) },
		} );
		let hidden = true;

		Object.defineProperty( document, 'hidden', {
			configurable: true,
			get: () => hidden,
		} );

		document.dispatchEvent( new window.Event( 'visibilitychange' ) );
		vi.advanceTimersByTime( 60000 );
		expect( apiFetch ).not.toHaveBeenCalled();

		hidden = false;
		document.dispatchEvent( new window.Event( 'visibilitychange' ) );
		vi.advanceTimersByTime( 10000 );
		expect( apiFetch ).toHaveBeenCalledTimes( 1 );

		delete document.hidden;
	} );

	test( 'no interval: no timer, and the text waits for a refresh', () => {
		vi.useFakeTimers();

		const { apiFetch } = startReport( { autoRefresh: 0 } );

		vi.advanceTimersByTime( 3600000 );

		expect( apiFetch ).not.toHaveBeenCalled();
		expect( vi.getTimerCount() ).toBe( 0 );
		expect( $( '.reports-last-updated-text' ).textContent ).toBe( '' );
	} );

	test( 'no controls on the page: nothing starts', () => {
		vi.useFakeTimers();

		const { refresh } = startReport( {
			html: '<div class="reports-wrap" data-report-id="x"></div>',
		} );

		expect( vi.getTimerCount() ).toBe( 0 );
		expect( refresh.state.lastUpdated ).toBeNull();
	} );
} );
