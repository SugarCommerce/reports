/**
 * Screen Options: a component goes the moment its box is unticked, the way
 * core's column toggles work -- there is no Apply button to find -- and the
 * choice is saved for this user over REST.
 *
 * Showing one again takes a reload: a hidden component is left out of the
 * markup on load so the refresh payload and the screen agree, so there is
 * nothing on the page to reveal until it is drawn again.
 */

import { all, on, quoted, toggle } from '../lib/dom';
import { data } from '../lib/data';
import { postJson } from '../lib/rest';

/**
 * Listen to the Screen Options boxes.
 *
 * @param {Document|Element} root           The page.
 * @param {Object}           options        What it needs.
 * @param {Function}         options.rest   From createRest().
 * @param {string}           options.url    The REST base, ending in `/`.
 * @param {Function}         options.reload Loads the page again.
 */
export function bindScreenOptions( root, { rest, url, reload } ) {
	on(
		root,
		'change',
		'.reports-screen-options input[type="checkbox"]',
		( event, box ) => {
			const panel = box.closest( '.reports-screen-options' );
			const components = all(
				`.reports-wrap [data-component-id="${ quoted( box.value ) }"]`,
				root
			);
			const shown = all( 'input[type="checkbox"]:checked', panel ).map(
				( checked ) => checked.value
			);

			components.forEach( ( component ) =>
				toggle( component, box.checked )
			);

			postJson( rest, url + 'screen-options', {
				report_id: data( panel, 'report' ),
				tab: data( panel, 'tab' ),
				shown,
			} ).then(
				() => {
					if ( box.checked && ! components.length ) {
						reload();
					}
				},
				() => {
					// The box and the component back as they were, so the
					// screen never shows a choice that was not kept.
					box.checked = ! box.checked;
					components.forEach( ( component ) =>
						toggle( component, box.checked )
					);
				}
			);
		}
	);
}
