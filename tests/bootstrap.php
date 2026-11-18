<?php
/**
 * PHPUnit bootstrap.
 *
 * @package SugarCommerce\Reports
 */

declare( strict_types=1 );

/*
 * Several dependencies guard their files-autoloaded entrypoints with
 * `defined( 'ABSPATH' ) || exit;`. Composer runs those on require of the
 * autoloader, so without this the whole suite exits before PHPUnit prints
 * anything — status 0, no output, indistinguishable from a pass.
 */
// The warnings this library prints for a mistake in configuration only fire
// under WP_DEBUG, so a suite that left it off would pass whether or not they
// were there at all.
if ( ! defined( 'WP_DEBUG' ) ) {
	define( 'WP_DEBUG', true );
}

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/*
 * Declared before the kit's stubs, which have a `current_user_can` that always
 * says yes. Fine for a field library; useless for testing that a REST endpoint
 * refuses somebody, which is the one thing about it worth testing.
 *
 * $GLOBALS['rp_caps'] is the list of capabilities the current user has. Null
 * means all of them, which keeps every other test from having to care.
 */
if ( ! function_exists( 'current_user_can' ) ) {
	function current_user_can( $capability, ...$args ) {
		$allowed = $GLOBALS['rp_caps'] ?? null;

		return null === $allowed || in_array( $capability, (array) $allowed, true );
	}
}

/*
 * Not in the kit's set: it renders form controls, and this library renders
 * links -- tabs, export downloads, pagination.
 */
if ( ! function_exists( 'esc_url' ) ) {
	function esc_url( $url ) {
		return esc_url_raw( $url );
	}
}

/*
 * The REST classes, to the extent this library uses them. Only what the
 * permission callbacks touch: a request is a bag of parameters and an error is
 * a code, a message and a status.
 *
 * Declared before sugarcommerce/fields's stubs: the kit stubs a request too now,
 * without get_params(), and whichever is declared first is the class.
 */
if ( ! class_exists( 'WP_REST_Request' ) ) {
	class WP_REST_Request {

		/**
		 * @var array<string, mixed>
		 */
		private array $params = [];

		/**
		 * @param string $method The method.
		 * @param string $route  The route.
		 */
		public function __construct( string $method = 'GET', string $route = '' ) {
		}

		/**
		 * @param string $key   Parameter name.
		 * @param mixed  $value Parameter value.
		 *
		 * @return void
		 */
		public function set_param( string $key, $value ): void {
			$this->params[ $key ] = $value;
		}

		/**
		 * @param string $key Parameter name.
		 *
		 * @return mixed
		 */
		public function get_param( string $key ) {
			return $this->params[ $key ] ?? null;
		}

		/**
		 * @return array<string, mixed>
		 */
		public function get_params(): array {
			return $this->params;
		}
	}
}

/*
 * The WordPress stubs of sugarcommerce/fields, copied from its suite as they
 * are: a Composer install leaves a package's tests behind, and writing a
 * second set would mean two answers to "what does esc_attr do in a test" —
 * which is how a suite ends up passing on markup that would not escape in
 * production. Refresh the copy when the fields package changes its own.
 *
 * Required before the autoloader for the same reason ABSPATH is.
 */
require_once __DIR__ . '/stubs.php';

/*
 * The handful this library reaches for that sugarcommerce/fields has no reason to.
 */
if ( ! function_exists( 'wp_parse_args' ) ) {
	function wp_parse_args( $args, $defaults = [] ) {
		return array_merge( $defaults, (array) $args );
	}
}

if ( ! function_exists( 'add_query_arg' ) ) {
	function add_query_arg( $args, $url = '' ) {
		return $url . ( str_contains( (string) $url, '?' ) ? '&' : '?' ) . http_build_query( (array) $args );
	}
}

if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( $url, $component = -1 ) {
		return parse_url( (string) $url, $component );
	}
}

if ( ! function_exists( 'trailingslashit' ) ) {
	function trailingslashit( $value ) {
		return rtrim( (string) $value, '/\\' ) . '/';
	}
}

if ( ! function_exists( 'wp_upload_dir' ) ) {
	function wp_upload_dir() {
		return [ 'basedir' => sys_get_temp_dir() . '/rp-uploads' ];
	}
}

if ( ! function_exists( 'wp_mkdir_p' ) ) {
	function wp_mkdir_p( $dir ) {
		return is_dir( $dir ) || mkdir( $dir, 0777, true );
	}
}

if ( ! function_exists( 'wp_generate_password' ) ) {
	function wp_generate_password( $length = 12, $special = true, $extra = false ) {
		return substr( str_repeat( 'abcdef0123456789', 4 ), 0, (int) $length );
	}
}

/*
 * What date utils reaches for and nothing else declares. Resolving a date
 * range is on the way in to every REST call, so without these the endpoints
 * are untestable rather than one date assertion being wrong.
 *
 * Fixed to a known moment rather than to now: a suite whose answers depend on
 * the day it runs is a suite that fails on the first of the month.
 */
if ( ! function_exists( 'current_time' ) ) {
	function current_time( $type = 'mysql', $gmt = 0 ) {
		return 'timestamp' === $type ? 1756080000 : gmdate( 'Y-m-d H:i:s', 1756080000 );
	}
}

if ( ! function_exists( 'get_gmt_from_date' ) ) {
	function get_gmt_from_date( $date, $format = 'Y-m-d H:i:s' ) {
		return gmdate( $format, strtotime( (string) $date ) ?: 1756080000 );
	}
}

if ( ! function_exists( 'get_date_from_gmt' ) ) {
	function get_date_from_gmt( $date, $format = 'Y-m-d H:i:s' ) {
		return gmdate( $format, strtotime( (string) $date ) ?: 1756080000 );
	}
}

if ( ! function_exists( 'wp_timezone' ) ) {
	/**
	 * The site's timezone: UTC, unless a test says where the site is.
	 *
	 * @return DateTimeZone
	 */
	function wp_timezone() {
		return new DateTimeZone( (string) ( $GLOBALS['rr_timezone'] ?? 'UTC' ) );
	}
}

if ( ! function_exists( 'wp_timezone_string' ) ) {
	function wp_timezone_string() {
		return 'UTC';
	}
}

/*
 * Filters, which the kit's stubs record but never run. This library applies
 * its own and expects the value back.
 */
if ( ! function_exists( 'apply_filters' ) ) {
	function apply_filters( $hook, $value, ...$args ) {
		foreach ( $GLOBALS['fk_filters'][ $hook ] ?? [] as $callback ) {
			$value = $callback( $value, ...$args );
		}

		return $value;
	}
}

if ( ! function_exists( 'do_action' ) ) {
	function do_action( $hook, ...$args ) {
		foreach ( $GLOBALS['fk_actions'][ $hook ] ?? [] as $callback ) {
			$callback( ...$args );
		}
	}
}

/*
 * The locale a chart formats its numbers in. $GLOBALS['rp_locale'] stands
 * in for an admin who chose another.
 */
if ( ! function_exists( 'get_user_locale' ) ) {
	function get_user_locale( $user = 0 ) {
		return $GLOBALS['rp_locale'] ?? 'en_US';
	}
}

if ( ! function_exists( 'esc_js' ) ) {
	function esc_js( $text ) {
		return str_replace( [ '\\', "'", '"', "\n", "\r" ], [ '\\\\', "\\'", '\\"', '', '' ], (string) $text );
	}
}

if ( ! function_exists( 'get_transient' ) ) {
	function get_transient( $key ) {
		return $GLOBALS['rp_transients'][ $key ] ?? false;
	}
}

if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( $key, $value, $expires = 0 ) {
		$GLOBALS['rp_transients'][ $key ] = $value;

		return true;
	}
}

if ( ! function_exists( 'delete_transient' ) ) {
	function delete_transient( $key ) {
		unset( $GLOBALS['rp_transients'][ $key ] );

		return true;
	}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {

		/**
		 * @var mixed
		 */
		private $data;

		/**
		 * @param mixed $data   The payload.
		 * @param int   $status HTTP status.
		 */
		public function __construct( $data = null, int $status = 200 ) {
			$this->data = $data;
		}

		/**
		 * @return mixed
		 */
		public function get_data() {
			return $this->data;
		}
	}
}

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {

		/**
		 * @var array<string, mixed>
		 */
		private array $data;

		/**
		 * @var string
		 */
		private string $code;

		/**
		 * @var string
		 */
		private string $message;

		/**
		 * @param string $code    Error code.
		 * @param string $message Error message.
		 * @param mixed  $data    Error data.
		 */
		public function __construct( string $code = '', string $message = '', $data = [] ) {
			$this->code    = $code;
			$this->message = $message;
			$this->data    = (array) $data;
		}

		/**
		 * @return string
		 */
		public function get_error_code(): string {
			return $this->code;
		}

		/**
		 * @return string
		 */
		public function get_error_message(): string {
			return $this->message;
		}

		/**
		 * @return array<string, mixed>
		 */
		public function get_error_data(): array {
			return $this->data;
		}
	}
}

if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ) {
		return $thing instanceof WP_Error;
	}
}

if ( ! class_exists( 'WP_REST_Server' ) ) {
	/*
	 * Only the method constants the routes name; registering them is what
	 * the route test does, and the stub recorder does not read the methods.
	 */
	class WP_REST_Server {
		const READABLE  = 'GET';
		const CREATABLE = 'POST';
		const EDITABLE  = 'POST, PUT, PATCH';
		const DELETABLE = 'DELETE';
	}
}

if ( ! function_exists( 'get_current_user_id' ) ) {
	function get_current_user_id() {
		return 1;
	}
}

if ( ! function_exists( 'get_user_meta' ) ) {
	/*
	 * In-memory user meta, keyed by user then key, the way the Screen
	 * Options preference is stored; reset it between tests.
	 */
	function get_user_meta( $user_id, $key, $single = false ) {
		$value = $GLOBALS['rp_user_meta'][ $user_id ][ $key ] ?? null;

		if ( null === $value ) {
			return $single ? '' : [];
		}

		return $single ? $value : [ $value ];
	}
}

if ( ! function_exists( 'update_user_meta' ) ) {
	function update_user_meta( $user_id, $key, $value ) {
		$GLOBALS['rp_user_meta'][ $user_id ][ $key ] = $value;

		return true;
	}
}

if ( ! function_exists( 'wp_timezone' ) ) {
	/**
	 * The site's timezone.
	 *
	 * @return DateTimeZone
	 */
	function wp_timezone(): DateTimeZone {
		return new DateTimeZone( $GLOBALS['rr_timezone'] ?? 'UTC' );
	}
}

if ( ! function_exists( 'date_i18n' ) ) {
	/**
	 * Core's translated date formatter.
	 *
	 * Core expects a timestamp already shifted into the site's offset, which
	 * is what sugarcommerce/dates hands it.
	 *
	 * @param string   $format    Date format.
	 * @param int|null $timestamp Shifted timestamp.
	 *
	 * @return string
	 */
	function date_i18n( string $format, ?int $timestamp = null ): string {
		return gmdate( $format, $timestamp ?? time() );
	}
}

if ( ! function_exists( 'wp_date' ) ) {
	/**
	 * Core's date formatter: the real moment, shown in a timezone.
	 *
	 * What Site::format() of sugarcommerce/dates calls, in place of
	 * date_i18n() with the offset added by hand.
	 *
	 * @param string            $format    Date format.
	 * @param int|null          $timestamp Unix time.
	 * @param DateTimeZone|null $timezone  Zone, or null for the site's.
	 *
	 * @return string
	 */
	function wp_date( string $format, ?int $timestamp = null, ?DateTimeZone $timezone = null ): string {
		return ( new DateTimeImmutable( '@' . ( $timestamp ?? time() ) ) )
			->setTimezone( $timezone ?? wp_timezone() )
			->format( $format );
	}
}

if ( ! function_exists( 'settings_errors' ) ) {
	/**
	 * Core's notices for a settings group. A report has none in a test.
	 *
	 * @param string $setting The group.
	 *
	 * @return void
	 */
	function settings_errors( string $setting = '' ): void {
	}
}

if ( ! function_exists( 'get_current_screen' ) ) {
	/**
	 * The admin screen being drawn.
	 *
	 * $GLOBALS['rr_screen'] is its id; null is not being on a screen at all.
	 *
	 * @return object|null
	 */
	function get_current_screen(): ?object {
		$id = $GLOBALS['rr_screen'] ?? null;

		return null === $id ? null : (object) [ 'id' => $id ];
	}
}

if ( ! function_exists( 'wp_localize_script' ) ) {
	/**
	 * Hand a script its data. Kept in $GLOBALS['rr_localized'], by handle.
	 *
	 * @param string $handle Script handle.
	 * @param string $name   The global it is published as.
	 * @param array  $data   The data.
	 *
	 * @return bool
	 */
	function wp_localize_script( string $handle, string $name, array $data ): bool {
		$GLOBALS['rr_localized'][ $handle ] = $data;

		return true;
	}
}

if ( ! function_exists( 'sanitize_file_name' ) ) {
	/**
	 * Enough of core's: the characters a file name may not have, dropped.
	 *
	 * @param string $name A file name.
	 *
	 * @return string
	 */
	function sanitize_file_name( string $name ): string {
		return (string) preg_replace( '/[^A-Za-z0-9._-]+/', '', $name );
	}
}

if ( ! function_exists( 'wp_add_inline_script' ) ) {
	/**
	 * Add script before or after another. Nothing to run it here.
	 *
	 * @param string $handle   Script handle.
	 * @param string $data     The script.
	 * @param string $position before or after.
	 *
	 * @return bool
	 */
	function wp_add_inline_script( string $handle, string $data, string $position = 'after' ): bool {
		$GLOBALS['rr_inline'][ $handle ][] = [ $position, $data ];

		return true;
	}
}

require_once dirname( __DIR__ ) . '/vendor/autoload.php';
