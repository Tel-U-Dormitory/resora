"use client";

import styled from "styled-components";

export interface MascotSwitchProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	id?: string;
	className?: string;
}

export function MascotSwitch({
	checked,
	onChange,
	id = "mascot-toggle-cb",
	className = "",
}: MascotSwitchProps) {
	return (
		<StyledWrapper className={className}>
			<div className="checkbox-wrapper-10">
				<input
					type="checkbox"
					id={id}
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
					className="tgl tgl-flip"
					aria-label="Switch maskot antara Astra dan Astri"
				/>
				<label
					htmlFor={id}
					data-tg-on="Astri"
					data-tg-off="Astra"
					className="tgl-btn"
				>
					<span className="sr-only">Switch maskot Astra dan Astri</span>
				</label>
			</div>
		</StyledWrapper>
	);
}

const StyledWrapper = styled.div`
  .checkbox-wrapper-10 .tgl {
    display: none;
  }

  .checkbox-wrapper-10 .tgl,
  .checkbox-wrapper-10 .tgl:after,
  .checkbox-wrapper-10 .tgl:before,
  .checkbox-wrapper-10 .tgl *,
  .checkbox-wrapper-10 .tgl *:after,
  .checkbox-wrapper-10 .tgl *:before,
  .checkbox-wrapper-10 .tgl + .tgl-btn {
    box-sizing: border-box;
  }

  .checkbox-wrapper-10 .tgl::-moz-selection,
  .checkbox-wrapper-10 .tgl:after::-moz-selection,
  .checkbox-wrapper-10 .tgl:before::-moz-selection,
  .checkbox-wrapper-10 .tgl *::-moz-selection,
  .checkbox-wrapper-10 .tgl *:after::-moz-selection,
  .checkbox-wrapper-10 .tgl *:before::-moz-selection,
  .checkbox-wrapper-10 .tgl + .tgl-btn::-moz-selection,
  .checkbox-wrapper-10 .tgl::selection,
  .checkbox-wrapper-10 .tgl:after::selection,
  .checkbox-wrapper-10 .tgl:before::selection,
  .checkbox-wrapper-10 .tgl *::selection,
  .checkbox-wrapper-10 .tgl *:after::selection,
  .checkbox-wrapper-10 .tgl *:before::selection,
  .checkbox-wrapper-10 .tgl + .tgl-btn::selection {
    background: none;
  }

  .checkbox-wrapper-10 .tgl + .tgl-btn {
    outline: 0;
    display: block;
    width: 5.2em;
    height: 2.2em;
    position: relative;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }

  .checkbox-wrapper-10 .tgl + .tgl-btn:after,
  .checkbox-wrapper-10 .tgl + .tgl-btn:before {
    position: relative;
    display: block;
    content: "";
    width: 50%;
    height: 100%;
  }

  .checkbox-wrapper-10 .tgl + .tgl-btn:after {
    left: 0;
  }

  .checkbox-wrapper-10 .tgl + .tgl-btn:before {
    display: none;
  }

  .checkbox-wrapper-10 .tgl:checked + .tgl-btn:after {
    left: 50%;
  }

  .checkbox-wrapper-10 .tgl-flip + .tgl-btn {
    padding: 2px;
    transition: all 0.2s ease;
    font-family: inherit;
    perspective: 100px;
  }

  .checkbox-wrapper-10 .tgl-flip + .tgl-btn:after,
  .checkbox-wrapper-10 .tgl-flip + .tgl-btn:before {
    display: inline-block;
    transition: all 0.4s ease;
    width: 100%;
    text-align: center;
    position: absolute;
    line-height: 2.2em;
    font-weight: bold;
    color: #fff;
    position: absolute;
    top: 0;
    left: 0;
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    border-radius: 9999px;
  }

  .checkbox-wrapper-10 .tgl-flip + .tgl-btn:after {
    content: attr(data-tg-on);
    background: #e11d48;
    transform: rotateY(-180deg);
    box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4);
  }

  .checkbox-wrapper-10 .tgl-flip + .tgl-btn:before {
    background: #FF3A19;
    content: attr(data-tg-off);
    box-shadow: 0 4px 14px rgba(255, 58, 25, 0.4);
  }

  .checkbox-wrapper-10 .tgl-flip + .tgl-btn:active:before {
    transform: rotateY(-20deg);
  }

  .checkbox-wrapper-10 .tgl-flip:checked + .tgl-btn:before {
    transform: rotateY(180deg);
  }

  .checkbox-wrapper-10 .tgl-flip:checked + .tgl-btn:after {
    transform: rotateY(0);
    left: 0;
    background: #f43f5e;
  }

  .checkbox-wrapper-10 .tgl-flip:checked + .tgl-btn:active:after {
    transform: rotateY(20deg);
  }
`;
