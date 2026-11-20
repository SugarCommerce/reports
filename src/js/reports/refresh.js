/**
 * Refreshing a report in place: the Refresh button, the report's own
 * interval (`data-auto-refresh`, in seconds) while the page is in view, and
 * "Updated 2m ago" kept current.
 */

import { all, one } from '../lib/dom';
import { data } from '../lib/data';
import {
	currentEnd,
	currentFilters,
	currentPreset,
	currentStart,
	currentTab,
} from './location';

/**
 * How long ago the report was refreshed, in words.
 *
 * @param {number}   seconds Since the last refresh.
 * @param {Function} t       Says one of the script's words.
 * @return {string} "Updated just now", "Updated 12s ago", …
 */
export function updatedText( seconds, t ) {
	if ( seconds < 10 ) {
		return t( 'updatedJustNow' );
	}

	if ( seconds < 60 ) {
		return t( 'updatedSeconds', seconds );
	}

	if ( seconds < 3600 ) {
		return t( 'updatedMinutes', Math.floor( seconds / 60 ) );
	}

	return t( 'updatedHours', Math.floor( seconds / 3600 ) );
}

/**
 * The refresh for a page.
 *
 * @param {Document}  root           The page.
 * @param {Object}    options        What it needs.
 * @param {Function}  options.rest   From createRest().
 * @param {string}    options.url    The REST base, ending in `/`.
 * @param {string=}   options.preset The report's default preset.
 * @param {Function}  options.href   The address now.
 * @param {Function}  options.t      Says one of the script's words.
 * @param {Function}  options.update Draws the components sent.
 * @param {Function=} options.now    The time, as a Date.
 * @param {Object=}   options.log    Where a failure is reported.
 * @return {Object} { refresh, start, updateText, state }.
 */
export function createRefresh(
	root,
	{
		rest,
		url,
		preset,
		href,
		t,
		update,
		now = () => new Date(),
		log = window.console,
	}
) {
	const state = { timer: null, textTimer: null, lastUpdated: null };

	const interval = () =>
		parseInt(
			data( one( '.reports-refresh-controls', root ), 'auto-refresh' ),
			10
		);

	function updateText() {
		if ( ! state.lastUpdated ) {
			return;
		}

		const text = updatedText(
			Math.floor( ( now() - state.lastUpdated ) / 1000 ),
			t
		);

		all( '.reports-last-updated-text', root ).forEach( ( element ) => {
			element.textContent = text;
		} );
	}

	function refresh() {
		const buttons = all( '.reports-refresh-button', root );
		const reportId = data( one( '.reports-wrap', root ), 'report-id' );

		if (
			! reportId ||
			buttons.some( ( button ) =>
				button.classList.contains( 'refreshing' )
			)
		) {
			return;
		}

		buttons.forEach( ( button ) =>
			button.classList.add( 'refreshing', 'updating-message' )
		);
		all( '.reports-content', root ).forEach( ( content ) =>
			content.classList.add( 'reports-component-refreshing' )
		);

		const address = href();

		rest( {
			url: url + 'components',
			method: 'GET',
			data: {
				report_id: reportId,
				tab: currentTab( address ),
				date_preset: currentPreset( address, preset ),
				date_start: currentStart( address ),
				date_end: currentEnd( address ),
				...currentFilters( address ),
			},
		} )
			.then(
				( answer ) => {
					if ( answer.success && answer.components ) {
						update( answer.components );
					}
				},
				( failed ) => {
					log.error( 'Refresh failed:', failed.responseJSON );
				}
			)
			.finally( () => {
				buttons.forEach( ( button ) =>
					button.classList.remove( 'refreshing', 'updating-message' )
				);
				all( '.reports-content', root ).forEach( ( content ) =>
					content.classList.remove( 'reports-component-refreshing' )
				);

				state.lastUpdated = now();
				updateText();
			} );
	}

	function startTimer( seconds ) {
		if ( state.timer ) {
			clearInterval( state.timer );
		}

		state.timer = setInterval( refresh, seconds * 1000 );
	}

	/**
	 * Start the report's own interval, when it has one, paused while the
	 * page is out of view.
	 */
	function start() {
		if ( ! one( '.reports-refresh-controls', root ) ) {
			return;
		}

		const seconds = interval();

		state.lastUpdated = now();

		if ( seconds > 0 ) {
			startTimer( seconds );

			if ( state.textTimer ) {
				clearInterval( state.textTimer );
			}

			state.textTimer = setInterval( updateText, 10000 );

			root.addEventListener( 'visibilitychange', () => {
				if ( root.hidden ) {
					if ( state.timer ) {
						clearInterval( state.timer );
						state.timer = null;
					}
				} else if ( interval() > 0 ) {
					startTimer( interval() );
				}
			} );
		}
	}

	return { refresh, start, updateText, state };
}
