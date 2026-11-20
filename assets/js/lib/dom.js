/**
 * The few DOM helpers the script shares, so none of it needs jQuery.
 *
 * show(), hide() and toggle() do what jQuery's did, because the page was
 * written against them: the date picker, the export progress and the rows
 * PHP prints carry an inline `display: none` to be shown, and a row hidden
 * by a page of a table gets back the display it had. hide() remembers an
 * element's inline display; show() puts it back, or takes the `none` off,
 * and if a stylesheet still hides the element gives it the display its tag
 * has.
 */

/**
 * The display each element had before hide().
 *
 * @type {WeakMap<Element, string>}
 */
const hiddenFrom = new WeakMap();

/**
 * The display each tag has when nothing hides it, once worked out.
 *
 * @type {Object<string, string>}
 */
const natural = {};

/**
 * The first element matching a selector.
 *
 * @param {string}           selector CSS selector.
 * @param {Document|Element} root     Where to look.
 * @return {Element|null} The element.
 */
export const one = ( selector, root = document ) =>
	root ? root.querySelector( selector ) : null;

/**
 * Every element matching a selector, as an array.
 *
 * @param {string}           selector CSS selector.
 * @param {Document|Element} root     Where to look.
 * @return {Element[]} The elements.
 */
export const all = ( selector, root = document ) =>
	root ? Array.from( root.querySelectorAll( selector ) ) : [];

/**
 * Listen for an event on whatever matches a selector, now or later.
 *
 * Delegated, as jQuery's `$( document ).on( type, selector, … )` was, so a
 * pagination button drawn after the page loaded is heard as well as one
 * that was there first.
 *
 * @param {Document|Element} root     Where to listen.
 * @param {string}           type     Event type.
 * @param {string}           selector What the event must come from.
 * @param {Function}         handler  Called with ( event, matched element ).
 * @return {Function} Stops listening.
 */
export function on( root, type, selector, handler ) {
	const listener = ( event ) => {
		const target =
			event.target instanceof window.Element
				? event.target.closest( selector )
				: null;

		if ( target && root.contains( target ) ) {
			handler( event, target );
		}
	};

	root.addEventListener( type, listener );

	return () => root.removeEventListener( type, listener );
}

/**
 * Whether an element takes up room on the page: jQuery's `:visible`.
 *
 * @param {Element|null} element The element.
 * @return {boolean} Shown.
 */
export const isShown = ( element ) =>
	!! element &&
	!! (
		element.offsetWidth ||
		element.offsetHeight ||
		element.getClientRects().length
	);

/**
 * Whether an element is hidden by its own style or its stylesheet.
 *
 * @param {Element} element The element.
 * @return {boolean} Hidden.
 */
function hiddenWithinTree( element ) {
	return (
		element.style.display === 'none' ||
		( element.style.display === '' &&
			element.isConnected &&
			window.getComputedStyle( element ).display === 'none' )
	);
}

/**
 * The display an element's tag has when nothing hides it.
 *
 * @param {Element} element The element.
 * @return {string} block, table-row, and so on.
 */
function naturalDisplay( element ) {
	const name = element.nodeName;

	if ( ! natural[ name ] ) {
		const probe = element.ownerDocument.body.appendChild(
			element.ownerDocument.createElement( name )
		);
		const display = window.getComputedStyle( probe ).display;

		probe.remove();
		natural[ name ] = display && display !== 'none' ? display : 'block';
	}

	return natural[ name ];
}

/**
 * Hide an element, remembering the display it had.
 *
 * @param {Element|null} element The element.
 */
export function hide( element ) {
	if ( ! element || ! element.style ) {
		return;
	}

	if ( element.style.display !== 'none' ) {
		hiddenFrom.set( element, element.style.display );
		element.style.display = 'none';
	}
}

/**
 * Show an element.
 *
 * @param {Element|null} element The element.
 */
export function show( element ) {
	if ( ! element || ! element.style ) {
		return;
	}

	let display = null;

	if ( element.style.display === 'none' ) {
		display = hiddenFrom.get( element ) || null;

		if ( ! display ) {
			element.style.display = '';
		}
	}

	if ( element.style.display === '' && hiddenWithinTree( element ) ) {
		display = naturalDisplay( element );
	}

	if ( display !== null ) {
		element.style.display = display;
	}
}

/**
 * Show or hide an element: as it is told, or the other way from how it is.
 *
 * @param {Element|null} element The element.
 * @param {boolean=}     shown   Whether it shows; left out, it flips.
 */
export function toggle( element, shown ) {
	if ( ! element ) {
		return;
	}

	const showIt =
		typeof shown === 'boolean' ? shown : hiddenWithinTree( element );

	if ( showIt ) {
		show( element );
	} else {
		hide( element );
	}
}

/**
 * The nodes some markup makes, to insert: an icon the server drew.
 *
 * @param {string} markup Markup.
 * @return {Node[]} Its nodes.
 */
export function nodes( markup ) {
	const template = document.createElement( 'template' );

	template.innerHTML = String( markup ).trim();

	return Array.from( template.content.childNodes );
}

/**
 * A new element with a class and, optionally, its text.
 *
 * @param {string}  tag       Tag name.
 * @param {string}  className Class attribute.
 * @param {string=} text      Text content.
 * @return {Element} The element.
 */
export function make( tag, className = '', text ) {
	const element = document.createElement( tag );

	if ( className ) {
		element.className = className;
	}

	if ( text !== undefined ) {
		element.textContent = text;
	}

	return element;
}

/**
 * An element's siblings that match a selector, not counting itself.
 *
 * @param {Element} element  The element.
 * @param {string}  selector CSS selector.
 * @return {Element[]} The siblings.
 */
export function siblings( element, selector ) {
	return element && element.parentElement
		? Array.from( element.parentElement.children ).filter(
				( sibling ) =>
					sibling !== element && sibling.matches( selector )
			)
		: [];
}

/**
 * A value for a quoted attribute selector.
 *
 * @param {*} value The value.
 * @return {string} The value with its quotes and backslashes escaped.
 */
export const quoted = ( value ) => String( value ).replace( /["\\]/g, '\\$&' );
