import axios from 'axios';
import { getEnvVar } from '../utils/env';
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const tokens = await axios.get(`${baseUrl}/tokens`);
  console.log('Tokens =', JSON.stringify(tokens.data, null, 2));
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
