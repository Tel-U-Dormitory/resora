"use client";

import styled from "styled-components";

/**
 * StyledFormWrapper — Styled-components wrapper providing a sleek,
 * professional form UI with icon inputs, focus-within glow, and responsive cards.
 */
export const StyledFormWrapper = styled.div`
	width: 100%;
	display: flex;
	justify-content: center;
	align-items: center;

	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
		background-color: var(--surface);
		padding: 32px;
		width: 100%;
		max-width: 440px;
		border-radius: 20px;
		border: 1px solid var(--border);
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05),
			0 8px 10px -6px rgba(0, 0, 0, 0.04);
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}

	.flex-column {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.flex-column > label {
		color: var(--foreground);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	.inputForm {
		border: 1.5px solid var(--border);
		border-radius: 12px;
		height: 48px;
		display: flex;
		align-items: center;
		padding: 0 12px;
		transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
		background-color: var(--surface);
		color: var(--muted-foreground);
		position: relative;
	}

	.inputForm:focus-within {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px var(--primary-soft);
		color: var(--primary);
	}

	.inputForm svg {
		color: inherit;
		flex-shrink: 0;
	}

	.inputForm .input {
		margin-left: 10px;
		border-radius: 10px;
		border: none;
		outline: none;
		width: 100%;
		height: 100%;
		background: transparent;
		color: var(--foreground);
		font-size: 14px;
		padding: 0;
		box-shadow: none;
	}

	.inputForm .input:focus,
	.inputForm .input:focus-visible {
		outline: none;
		box-shadow: none;
		border: none;
	}

	.inputForm .input::placeholder {
		color: var(--muted-foreground);
		opacity: 0.75;
	}

	.flex-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		justify-content: space-between;
	}

	.flex-row > div > label {
		font-size: 13px;
		color: var(--muted-foreground);
		font-weight: 400;
	}

	.span {
		font-size: 13px;
		color: var(--primary);
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.span:hover {
		text-decoration: underline;
	}

	.button-submit {
		margin-top: 10px;
		background-color: var(--primary);
		border: none;
		color: var(--primary-foreground);
		font-size: 15px;
		font-weight: 600;
		border-radius: 12px;
		height: 48px;
		width: 100%;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease-in-out;
		box-shadow: 0 4px 12px rgba(225, 59, 48, 0.25);
	}

	.button-submit:hover:not(:disabled) {
		background-color: var(--primary-hover);
		box-shadow: 0 6px 16px rgba(225, 59, 48, 0.35);
		transform: translateY(-1px);
	}

	.button-submit:active:not(:disabled) {
		transform: translateY(0);
	}

	.button-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.p {
		text-align: center;
		color: var(--muted-foreground);
		font-size: 13px;
		margin: 4px 0;
	}

	.btn {
		width: 100%;
		height: 44px;
		border-radius: 12px;
		display: flex;
		justify-content: center;
		align-items: center;
		font-weight: 500;
		font-size: 14px;
		gap: 10px;
		border: 1px solid var(--border);
		background-color: var(--surface);
		color: var(--foreground);
		cursor: pointer;
		transition: 0.2s ease-in-out;
	}

	.btn:hover {
		border-color: var(--primary);
		background-color: var(--muted);
	}
`;
