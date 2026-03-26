import axios from 'axios';

const client = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

export async function get<T>(url: string): Promise<T> {
  const res = await client.get(url);
  return res.data;
}

export async function post<T>(url: string, data: unknown): Promise<T> {
  const res = await client.post(url, data);
  return res.data;
}

export async function put<T>(url: string, data: unknown): Promise<T> {
  const res = await client.put(url, data);
  return res.data;
}

export async function del<T>(url: string): Promise<T> {
  const res = await client.delete(url);
  return res.data;
}

export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const res = await client.patch(url, data);
  return res.data;
}
