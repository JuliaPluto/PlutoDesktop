import React from "react";

type Props = {
  url: string | undefined;
};

const PlutoFrame = (props: Props) => {
  return (
    <iframe
      id="pluto-frame"
      title="Pluto"
      src={props.url}
      allowFullScreen
      loading="eager"
      referrerPolicy="no-referrer"
    ></iframe>
  );
};

export default PlutoFrame;
