/**
 * Each prefixed copy reads its own settings, and its words.
 *
 * Strauss renames classes, not script handles or global keys, so two
 * plugins bundling this library land on one screen with two copies of the
 * script and one window. Resolving by the handle WordPress stamped on the
 * running script is what stops the second copy answering with the first
 * one's REST namespace and nonce.
 */

import { describe, expect, test } from 'vitest';

import { handleOf, resolveConfig } from '../../assets/js/lib/config';
import { fill, translator } from '../../assets/js/lib/text';

describe( 'settings', () => {
	const registry = {
		'plugin-a-reports': { restUrl: '/a/', restNonce: 'aaa' },
		'plugin-b-reports': { restUrl: '/b/', restNonce: 'bbb' },
	};

	test( 'each copy finds its own by its tag', () => {
		[ 'a', 'b' ].forEach( ( which ) => {
			const settings = resolveConfig(
				{ id: `plugin-${ which }-reports-js` },
				{ SugarCommerceReports: registry }
			);

			expect( settings.restUrl ).toBe( `/${ which }/` );
		} );
	} );

	test( 'the handle is the tag id without -js, and only that', () => {
		expect( handleOf( { id: 'sugarcommerce-reports-js' } ) ).toBe(
			'sugarcommerce-reports'
		);
		expect( handleOf( { id: 'a-js-b-js' } ) ).toBe( 'a-js-b' );
		expect( handleOf( { id: '' } ) ).toBe( '' );
		expect( handleOf( null ) ).toBe( '' );
	} );

	test( 'the localized object when the registry has no entry', () => {
		const localized = { restUrl: '/plain/' };

		expect(
			resolveConfig(
				{ id: 'other-js' },
				{
					SugarCommerceReports: registry,
					SugarcommerceReportsAdmin: localized,
				}
			)
		).toBe( localized );
	} );

	test( 'an empty object when there is nothing at all', () => {
		expect( resolveConfig( null, {} ) ).toEqual( {} );
	} );
} );

describe( 'words', () => {
	test( 'with no strings, the key itself', () => {
		const t = translator( undefined );

		expect( t( 'noData' ) ).toBe( 'noData' );
	} );

	test( 'positional placeholders', () => {
		expect( translator( {} )( '%1$s of %2$s', 'one', 'three' ) ).toBe(
			'one of three'
		);
		expect(
			translator( { showing: 'Showing %1$d-%2$d of %3$d' } )(
				'showing',
				6,
				10,
				21
			)
		).toBe( 'Showing 6-10 of 21' );
	} );

	test( 'positions out of order', () => {
		expect( fill( '%2$s, then %1$s', [ 'a', 'b' ] ) ).toBe( 'b, then a' );
	} );

	test( 'plain placeholders in order', () => {
		expect( fill( 'Updated %ds ago', [ 12 ] ) ).toBe( 'Updated 12s ago' );
		expect( fill( '%s and %s', [ 'x', 'y' ] ) ).toBe( 'x and y' );
	} );

	test( 'a placeholder with no value is left alone', () => {
		expect( fill( '%1$s and %2$s', [ 'x' ] ) ).toBe( 'x and %2$s' );
		expect( fill( '%s and %s', [ 'x' ] ) ).toBe( 'x and %s' );
	} );

	test( 'no values, no change', () => {
		expect( fill( '100%s sure', [] ) ).toBe( '100%s sure' );
	} );
} );
