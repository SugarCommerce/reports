/**
 * The report's REST requests.
 *
 * Through wp.apiFetch, because the nonce printed with the page runs out
 * after a day: a report left open (and refreshing itself) overnight got a
 * 403 on every refresh, export and screen option. apiFetch notices the
 * stale nonce, asks for a fresh one and sends the request again.
 *
 * A refusal is handed on as `{ responseJSON, status }`, what an xhr would
 * have said: the body WordPress answered with, or nothing when there was no
 * answer to read (the network, a page that was not JSON, an abort).
 */

import { param } from './query';

/**
 * What went wrong, as the callers read it.
 *
 * @param {*} error What apiFetch rejected with.
 * @return {{responseJSON: (Object|undefined), status: number}} The failure.
 */
export function failure( error ) {
	const body =
		error &&
		typeof error === 'object' &&
		[ 'invalid_json', 'fetch_error', 'offline_error' ].indexOf(
			error.code
		) === -1 &&
		error.name !== 'AbortError'
			? error
			: undefined;

	return {
		responseJSON: body,
		status: ( body && body.data && body.data.status ) || 0,
	};
}

/**
 * A request function bound to apiFetch and the page's nonce.
 *
 * @param {Function} apiFetch wp.apiFetch, or a stand-in.
 * @param {string}   nonce    The REST nonce PHP printed.
 * @return {Function} ( { url, method, data, contentType } ) => Promise of
 *                    the decoded answer; rejects with failure().
 */
export function createRest( apiFetch, nonce ) {
	return ( { url, method = 'GET', data, contentType } ) => {
		const request = {
			url,
			method,
			headers: { 'X-WP-Nonce': nonce },
			parse: true,
		};

		if ( method === 'GET' ) {
			const query = data ? param( data ) : '';

			if ( query ) {
				request.url +=
					( request.url.indexOf( '?' ) === -1 ? '?' : '&' ) + query;
			}
		} else if ( data !== undefined ) {
			request.body = data;

			if ( contentType ) {
				request.headers[ 'Content-Type' ] = contentType;
			}
		}

		return apiFetch( request ).then(
			( answer ) => answer,
			( error ) => Promise.reject( failure( error ) )
		);
	};
}

/**
 * Post JSON.
 *
 * @param {Function} rest    From createRest().
 * @param {string}   url     Where.
 * @param {Object}   payload What, encoded as JSON.
 * @return {Promise<*>} The decoded answer.
 */
export const postJson = ( rest, url, payload ) =>
	rest( {
		url,
		method: 'POST',
		contentType: 'application/json',
		data: JSON.stringify( payload ),
	} );
