/**
 * CSV exports that do not time out: the export is started, then written a
 * batch at a time, each its own request, with the card's bar showing how
 * far it has got; the file is downloaded when the last batch is in.
 */

import { all, hide, on, show } from '../lib/dom';
import { data } from '../lib/data';
import { postJson } from '../lib/rest';
import { currentEnd, currentPreset, currentStart } from './location';

/**
 * A field's value, as a form would send it.
 *
 * @param {Element} field An input, select or textarea.
 * @return {string} Its value.
 */
const valueOf = ( field ) => String( field.value ?? '' ).replace( /\r/g, '' );

/**
 * The options chosen in a multiple select.
 *
 * @param {HTMLSelectElement} select The select.
 * @return {string[]} Their values.
 */
const chosen = ( select ) =>
	Array.from( select.options )
		.filter(
			( option ) =>
				option.selected &&
				! option.disabled &&
				! (
					option.parentNode.disabled &&
					option.parentNode.nodeName === 'OPTGROUP'
				)
		)
		.map( valueOf );

/**
 * The filters an export card's fields say, by name without `filter_`.
 *
 * Checkboxes are a list of what is ticked (empty when none is), a multiple
 * select a list of what is chosen, anything else its value when it has one.
 *
 * @param {Element} card The `.reports-export-card`.
 * @return {Object} Filter => value, or filter => list.
 */
export function gatherExportFilters( card ) {
	const filters = {};

	all( '.reports-filter-input', card ).forEach( ( field ) => {
		const name = field.getAttribute( 'name' );

		if ( ! name ) {
			return;
		}

		const key = name.replace( /^filter_/, '' ).replace( /\[]$/, '' );

		if ( field.matches( 'input[type="checkbox"]' ) ) {
			filters[ key ] = filters[ key ] || [];

			if ( field.checked ) {
				filters[ key ].push( valueOf( field ) );
			}
		} else if ( field.matches( 'select[multiple]' ) ) {
			filters[ key ] = chosen( field );
		} else if ( valueOf( field ) ) {
			filters[ key ] = valueOf( field );
		}
	} );

	return filters;
}

/**
 * Listen to the export buttons.
 *
 * @param {Document|Element} root             The page.
 * @param {Object}           options          What it needs.
 * @param {Function}         options.rest     From createRest().
 * @param {string}           options.url      The REST base, ending in `/`.
 * @param {string=}          options.preset   The report's default preset.
 * @param {Function}         options.href     The address now.
 * @param {Function}         options.navigate Loads an address: the file.
 * @param {Function}         options.t        Says one of the script's words.
 */
export function bindExports( root, { rest, url, preset, href, navigate, t } ) {
	on( root, 'click', '.reports-export-button', ( event, button ) => {
		event.preventDefault();

		if ( button.disabled ) {
			return;
		}

		const card = button.closest( '.reports-export-card' );
		const progress = all( '.reports-export-progress', card );
		const fill = all( '.reports-export-progress-fill', card );
		const label = all( '.reports-export-progress-label', card );
		const percent = all( '.reports-export-progress-percent', card );

		const say = ( elements, text ) =>
			elements.forEach( ( element ) => {
				element.textContent = text;
			} );
		const width = ( value ) =>
			fill.forEach( ( element ) => {
				element.style.width = value;
			} );
		const buttonText = ( text ) =>
			say( all( '.button-text', button ), text );

		const reset = () => {
			button.disabled = false;
			buttonText( t( 'download' ) );
			progress.forEach( hide );
			label.forEach( ( element ) => element.classList.remove( 'error' ) );
		};

		const fail = ( message ) => {
			say( label, t( 'error' ) + ': ' + message );
			label.forEach( ( element ) => element.classList.add( 'error' ) );
			setTimeout( reset, 3000 );
		};

		const message = ( failed, fallback ) =>
			failed.responseJSON ? failed.responseJSON.message : t( fallback );

		const batch = ( token, number ) =>
			postJson( rest, url + 'export/batch', {
				export_token: token,
				batch: number,
			} ).then(
				( answer ) => {
					if ( ! answer.success ) {
						fail( answer.message || t( 'batchFailed' ) );
						return;
					}

					const done = Math.round(
						( answer.processed_items / answer.total_items ) * 100
					);

					width( done + '%' );
					say( percent, done + '%' );
					say(
						label,
						t(
							'processing',
							answer.processed_items,
							answer.total_items
						)
					);

					if ( ! answer.is_complete ) {
						batch( token, number + 1 );
						return;
					}

					say( label, t( 'complete' ) );
					width( '100%' );
					say( percent, '100%' );

					setTimeout( () => {
						navigate( answer.download_url );
						reset();
					}, 500 );
				},
				( failed ) => fail( message( failed, 'batchFailed' ) )
			);

		button.disabled = true;
		buttonText( t( 'exporting' ) );
		progress.forEach( show );
		width( '0%' );
		say( label, t( 'preparing' ) );
		say( percent, '0%' );

		const address = href();

		postJson( rest, url + 'export/start', {
			report_id: data( button, 'report-id' ),
			export_id: data( button, 'export-id' ),
			filters: gatherExportFilters( card ),
			date_preset: currentPreset( address, preset ),
			date_start: currentStart( address ),
			date_end: currentEnd( address ),
		} ).then(
			( answer ) => {
				if ( answer.success ) {
					batch( answer.export_token, 0 );
				} else {
					fail( answer.message || t( 'exportFailed' ) );
				}
			},
			( failed ) => fail( message( failed, 'exportFailed' ) )
		);
	} );
}
