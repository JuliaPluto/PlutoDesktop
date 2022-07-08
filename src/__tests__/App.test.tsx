import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import Loading from '../renderer/Loading';

describe('App', () => {
  it('should render', () => {
    expect(render(<Loading />)).toBeTruthy();
  });
});
