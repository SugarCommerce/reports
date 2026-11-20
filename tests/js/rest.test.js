/**
 * Requests go through wp.apiFetch.
 *
 * The page's nonce runs out after a day, and a report refreshes itself on a
 * timer: sent with the printed nonce alone, a screen left open overnight got
 * a 403 on every refresh. apiFetch fetches a fresh nonce and retries.
 */

import { describe, expect, test, vi } from 'vitest';

import { createRest, failure, postJson } from '../../assets/js/lib/rest';

const URL_BASE = 'https://example.test/wp-json/r/v1/';

describe( 'a request', () => {
	test( 'a GET carries its data on the address, with the nonce, parsed', async () => {
		const apiFetch = vi.fn( () => Promise.resolve( { success: true } ) );
		const rest = createRest( apiFetch, 'n0nce' );

		await expect(
			rest( {
				url: URL_BASE + 'components',
				data: { report_id: 'sales', filter_status: [ 'a', 'b' ] },
			} )
		).resolves.toEqual( { success: true } );

		expect( apiFetch ).toHaveBeenCalledWith( {
			url:
				URL_BASE +
				'components?report_id=sales&filter_status%5B%5D=a&filter_status%5B%5D=b',
			method: 'GET',
			headers: { 'X-WP-Nonce': 'n0nce' },
			parse: true,
		} );
	} );

	test( 'a GET onto an address with a query already', async () => {
		const apiFetch = vi.fn( () => Promise.resolve( {} ) );

		await createRest(
			apiFetch,
			'n'
		)( {
			url: URL_BASE + 'components?x=1',
			data: { y: 2 },
		} );

		expect( apiFetch.mock.calls[ 0 ][ 0 ].url ).toBe(
			URL_BASE + 'components?x=1&y=2'
		);
	} );

	test( 'a GET with nothing to say adds nothing', async () => {
		const apiFetch = vi.fn( () => Promise.resolve( {} ) );
		const rest = createRest( apiFetch, 'n' );

		await rest( { url: URL_BASE + 'a' } );
		await rest( { url: URL_BASE + 'b', data: {} } );

		expect( apiFetch.mock.calls.map( ( [ r ] ) => r.url ) ).toEqual( [
			URL_BASE + 'a',
			URL_BASE + 'b',
		] );
	} );

	test( 'a POST carries JSON with its type', async () => {
		const apiFetch = vi.fn( () => Promise.resolve( { success: true } ) );

		await postJson(
			createRest( apiFetch, 'n0nce' ),
			URL_BASE + 'export/start',
			{
				report_id: 'sales',
				filters: {},
			}
		);

		expect( apiFetch ).toHaveBeenCalledWith( {
			url: URL_BASE + 'export/start',
			method: 'POST',
			headers: {
				'X-WP-Nonce': 'n0nce',
				'Content-Type': 'application/json',
			},
			parse: true,
			body: '{"report_id":"sales","filters":{}}',
		} );
	} );

	test( 'a POST with no body sends none, and no type', async () => {
		const apiFetch = vi.fn( () => Promise.resolve( {} ) );

		await createRest(
			apiFetch,
			'n'
		)( {
			url: URL_BASE + 'x',
			method: 'POST',
			contentType: 'application/json',
		} );

		expect( apiFetch.mock.calls[ 0 ][ 0 ] ).toEqual( {
			url: URL_BASE + 'x',
			method: 'POST',
			headers: { 'X-WP-Nonce': 'n' },
			parse: true,
		} );
	} );
} );

describe( 'a refusal', () => {
	test( "WordPress's answer is handed on with its status", async () => {
		const answer = {
			code: 'rest_forbidden',
			message: 'No.',
			data: { status: 403 },
		};
		const rest = createRest( () => Promise.reject( answer ), 'n' );

		await expect( rest( { url: URL_BASE } ) ).rejects.toEqual( {
			responseJSON: answer,
			status: 403,
		} );
	} );

	test( 'no answer to read is nothing', () => {
		[
			{ code: 'invalid_json', message: 'Not JSON' },
			{ code: 'fetch_error', message: 'Offline' },
			{ code: 'offline_error', message: 'Offline' },
			{ name: 'AbortError', message: 'Aborted' },
			null,
			'a string',
		].forEach( ( error ) => {
			expect( failure( error ) ).toEqual( {
				responseJSON: undefined,
				status: 0,
			} );
		} );
	} );

	test( 'an answer with no status is status 0', () => {
		expect( failure( { code: 'x', message: 'Hm' } ) ).toEqual( {
			responseJSON: { code: 'x', message: 'Hm' },
			status: 0,
		} );
	} );
} );
