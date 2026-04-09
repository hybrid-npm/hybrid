/**
 * Global logger instance for conditional debug logging
 * Compatible with common logger interfaces
 */
export const logger = {
	debug: (message: string, ...args: any[]): void => {
		if (typeof process !== 'undefined' && process.env?.DEBUG) {
			console.log(message, ...args)
		}
	},
	log: (message: string, ...args: any[]): void => {
		if (typeof process !== 'undefined' && process.env?.DEBUG) {
			console.log(message, ...args)
		}
	},
	info: (message: string, ...args: any[]): void => {
		if (typeof process !== 'undefined' && process.env?.DEBUG) {
			console.info(message, ...args)
		}
	},
	warn: (message: string, ...args: any[]): void => {
		if (typeof process !== 'undefined' && process.env?.DEBUG) {
			console.warn(message, ...args)
		}
	},
	error: (message: string, ...args: any[]): void => {
		if (typeof process !== 'undefined' && process.env?.DEBUG) {
			console.error(message, ...args)
		}
	}
}
