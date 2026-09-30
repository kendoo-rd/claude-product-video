import React from "react";
import { Composition } from "remotion";
import { ProductFilm, FILM_FRAMES, FPS, type Film } from "./Film";
import config from "../video.config.json";
import { FILMS } from "./films/index";

/**
 * Every film is the same component with a different config, so they register
 * in a loop. src/films/index.ts is written by tools/build-film.mjs, so
 * building a film is all it takes to make it renderable.
 */
const C = config as any;

export const RemotionRoot: React.FC = () => (
  <>
    {(FILMS as Film[]).map((film) => (
      <Composition
        key={film.n}
        id={`Film${film.n}`}
        component={ProductFilm}
        defaultProps={{ film }}
        durationInFrames={FILM_FRAMES}
        fps={FPS}
        width={C.format.width}
        height={C.format.height}
      />
    ))}
  </>
);
