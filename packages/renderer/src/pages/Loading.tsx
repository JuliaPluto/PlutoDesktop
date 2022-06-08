import React from "react";

type Props = {
  msg: string;
};

const Loading = (props: Props) => {
  return (
    <div>
      <h1>Welcome to pluto</h1>
      <h2>{props.msg}</h2>
    </div>
  );
};

export default Loading;
