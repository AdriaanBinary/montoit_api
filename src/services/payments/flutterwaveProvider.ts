import { createHmac, timingSafeEqual } from 'node:crypto';

const FLUTTERWAVE_TOKEN_URL = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

type FlutterwaveEnvironment = 'sandbox' | 'live';

export type FlutterwaveCustomer = {
	email: string;
	name?: { first: string; last: string };
	phone?: { country_code: string; number: string };
};

export type FlutterwavePaymentMethod = {
	type: string;
	[key: string]: unknown;
};

export type FlutterwaveOrderInput = {
	amount: number;
	currency: string;
	reference: string;
	customer: FlutterwaveCustomer;
	payment_method: FlutterwavePaymentMethod;
	redirect_url?: string;
	description?: string;
	meta?: Record<string, string>;
};

export type FlutterwaveOrder = {
	id?: string;
	amount?: number;
	currency?: string;
	reference?: string;
	status?: string;
	redirect_url?: string;
	next_action?: { type?: string; redirect_url?: { url?: string } };
	[key: string]: unknown;
};

export type FlutterwaveCharge = FlutterwaveOrder;

type FlutterwaveResponse<T> = {
	status?: string;
	message?: string;
	data?: T;
	[key: string]: unknown;
};

type TokenState = {
	accessToken: string;
	expiresAt: number;
};

export function isValidFlutterwaveWebhookSignature(
	rawBody: string | Buffer,
	signature: string | undefined,
	secretHash: string | undefined
): boolean {
	if (!signature || !secretHash) {
		return false;
	}

	const expectedSignature = createHmac('sha256', secretHash).update(rawBody).digest('base64');
	const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
	const receivedBuffer = Buffer.from(signature, 'utf8');

	return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export class FlutterwaveProviderError extends Error {
	readonly statusCode?: number;
	readonly responseBody?: unknown;

	constructor(message: string, statusCode?: number, responseBody?: unknown) {
		super(message);
		this.name = 'FlutterwaveProviderError';
		this.statusCode = statusCode;
		this.responseBody = responseBody;
	}
}

function getRequiredEnvironmentValue(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new FlutterwaveProviderError(`Missing Flutterwave configuration: ${name}`);
	}

	return value;
}

function getEnvironment(): FlutterwaveEnvironment {
	return process.env.FLW_USE_SANDBOX?.toLowerCase() === 'false' ? 'live' : 'sandbox';
}

function getConfig() {
	const environment = getEnvironment();
	const prefix = environment === 'sandbox' ? 'FLW_SANDBOX' : 'FLW_LIVE';

	return {
		environment,
		clientId: getRequiredEnvironmentValue(`${prefix}_CLIENT_ID`),
		clientSecret: getRequiredEnvironmentValue(`${prefix}_CLIENT_SECRET`),
		apiBaseUrl: process.env[`${prefix}_API_BASE_URL`]?.trim() ||
			(environment === 'sandbox'
				? 'https://developersandbox-api.flutterwave.com'
				: 'https://api.flutterwave.com')
	};
}

export class FlutterwaveProvider {
	async createCharge(input: FlutterwaveOrderInput): Promise<FlutterwaveCharge> {
		return this.createOrchestratorResource<FlutterwaveCharge>('/orchestration/direct-charges', input);
	}

	private tokenState?: TokenState;

	async createOrder(input: FlutterwaveOrderInput): Promise<FlutterwaveOrder> {
		return this.createOrchestratorResource<FlutterwaveOrder>('/orchestration/direct-orders', input);
	}

	private async createOrchestratorResource<T>(path: string, input: FlutterwaveOrderInput): Promise<T> {
		const response = await this.request<T>(path, {
			method: 'POST',
			body: JSON.stringify(input),
			headers: {
				'X-Trace-Id': crypto.randomUUID(),
				'X-Idempotency-Key': input.reference
			}
		});

		if (!response.data) {
			throw new FlutterwaveProviderError('Flutterwave returned no payment data', undefined, response);
		}

		return response.data;
	}

	async retrieveCharge(chargeId: string): Promise<FlutterwaveCharge> {
		const response = await this.request<FlutterwaveCharge>(`/charges/${encodeURIComponent(chargeId)}`, {
			method: 'GET'
		});

		if (!response.data) {
			throw new FlutterwaveProviderError('Flutterwave returned no charge data', undefined, response);
		}

		return response.data;
	}

	async retrieveOrder(orderId: string): Promise<FlutterwaveOrder> {
		const response = await this.request<FlutterwaveOrder>(`/orders/${encodeURIComponent(orderId)}`, {
			method: 'GET'
		});

		if (!response.data) {
			throw new FlutterwaveProviderError('Flutterwave returned no order data', undefined, response);
		}

		return response.data;
	}

	private async getAccessToken(): Promise<string> {
		if (this.tokenState && this.tokenState.expiresAt > Date.now()) {
			return this.tokenState.accessToken;
		}

		const config = getConfig();
		const response = await fetch(FLUTTERWAVE_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				grant_type: 'client_credentials'
			})
		});
		const body = await this.parseResponse<Record<string, unknown>>(response);
		const accessToken = typeof body.access_token === 'string' ? body.access_token : undefined;
		const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 600;

		if (!response.ok || !accessToken) {
			throw new FlutterwaveProviderError('Unable to obtain Flutterwave OAuth token', response.status, body);
		}

		this.tokenState = {
			accessToken,
			expiresAt: Date.now() + Math.max(expiresIn - TOKEN_REFRESH_BUFFER_SECONDS, 1) * 1000
		};

		return accessToken;
	}

	private async request<T>(path: string, init: RequestInit): Promise<FlutterwaveResponse<T>> {
		const config = getConfig();
		const accessToken = await this.getAccessToken();
		const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				...init.headers
			}
		});
		const body = await this.parseResponse<FlutterwaveResponse<T>>(response);

		if (!response.ok) {
			throw new FlutterwaveProviderError(
				typeof body.message === 'string' ? body.message : 'Flutterwave API request failed',
				response.status,
				body
			);
		}

		return body;
	}

	private async parseResponse<T>(response: Response): Promise<T> {
		const text = await response.text();

		if (!text) {
			return {} as T;
		}

		try {
			return JSON.parse(text) as T;
		} catch {
			throw new FlutterwaveProviderError('Flutterwave returned an invalid JSON response', response.status, text);
		}
	}
}

export const flutterwaveProvider = new FlutterwaveProvider();
