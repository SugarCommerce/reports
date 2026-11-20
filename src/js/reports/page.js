/**
 * Two tidy-ups when the page loads: notices gathered under the header, and
 * the current section brought into view in a row that scrolls.
 */

import { all, one, siblings } from '../lib/dom';

const NOTICES = '.notice, .updated, .error';

/**
 * Move any stray notices into the report's notices container.
 *
 * Notices WordPress prints before or after the header, or beside the wrap
 * (and, with the sections down the side, beside the shell the wrap is a
 * column of), are moved under the header, in the order they came.
 *
 * @param {Document|Element} root The page.
 */
export function repositionNotices( root ) {
	const wrap = one( '.reports-wrap', root );
	const container = one( '.reports-notices', wrap );

	if ( ! container ) {
		return;
	}

	all( NOTICES, wrap )
		.filter(
			( notice ) =>
				! notice.matches(
					'.reports-notices .notice, .reports-notices .updated, .reports-notices .error'
				)
		)
		.forEach( ( notice ) => container.append( notice ) );

	siblings( wrap, NOTICES ).forEach( ( notice ) =>
		container.append( notice )
	);

	all( '.reports-shell', root ).forEach( ( shell ) =>
		siblings( shell, NOTICES ).forEach( ( notice ) =>
			container.append( notice )
		)
	);
}

/**
 * Bring the current section into view in a row that scrolls.
 *
 * The tab bar, and the sidebar on a narrow screen, are one line that
 * scrolls sideways when the sections do not fit. Arriving on the ninth of
 * ten, the row would otherwise open on the first three and the one being
 * read would be somewhere off the edge. Only the row is moved, never the
 * page; where everything fits there is nothing to scroll and this does
 * nothing.
 *
 * @param {Document|Element} root The page.
 */
export function revealCurrentSection( root ) {
	all(
		'.reports-sidebar-link[aria-current], .reports .field-kit__page-tab[aria-current]',
		root
	).forEach( ( current ) => {
		const row = current.closest(
			'.reports-sidebar-scroll, .field-kit__page-tabs'
		);

		if ( ! row || row.scrollWidth <= row.clientWidth ) {
			return;
		}

		const link = current.getBoundingClientRect();
		const box = row.getBoundingClientRect();

		row.scrollLeft += link.left - box.left - ( box.width - link.width ) / 2;
	} );
}
