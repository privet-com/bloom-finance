const API = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api`;
export const auth={
  get token(){return sessionStorage.getItem('bloom_token')},
  set token(v){v?sessionStorage.setItem('bloom_token',v):sessionStorage.removeItem('bloom_token')}
};
async function request(path, options={}){
  const headers={...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers};
  if(auth.token) headers.Authorization=`Bearer ${auth.token}`;
  const res=await fetch(API+path,{...options,headers});
  if(res.status===204)return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Request failed');
  return data;
}
export const api={
  register:(body)=>request('/auth/register',{method:'POST',body:JSON.stringify(body)}),
  login:(body)=>request('/auth/login',{method:'POST',body:JSON.stringify(body)}),
  me:()=>request('/me'), dashboard:(month)=>request(`/dashboard?month=${month}`),
  transactions:()=>request('/transactions'),
  addTransaction:(body)=>request('/transactions',{method:'POST',body:JSON.stringify(body)}),
  updateTransaction:(id,body)=>request(`/transactions/${id}`,{method:'PUT',body:JSON.stringify(body)}),
  deleteTransaction:(id)=>request(`/transactions/${id}`,{method:'DELETE'}),
  budgets:(month)=>request(`/budgets?month=${month}`),
  saveBudget:(body)=>request('/budgets',{method:'POST',body:JSON.stringify(body)}),
  deleteBudget:(id)=>request(`/budgets/${id}`,{method:'DELETE'}),
  goals:()=>request('/goals'), addGoal:(body)=>request('/goals',{method:'POST',body:JSON.stringify(body)}), deleteGoal:(id)=>request(`/goals/${id}`,{method:'DELETE'}),
  subscriptions:()=>request('/subscriptions'), addSubscription:(body)=>request('/subscriptions',{method:'POST',body:JSON.stringify(body)}), deleteSubscription:(id)=>request(`/subscriptions/${id}`,{method:'DELETE'}),
  importCsv:(file)=>{const f=new FormData();f.append('file',file);return request('/import/csv',{method:'POST',body:f})}
};
