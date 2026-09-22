if(location.protocol==='file:'){
  const target=new URL('http://127.0.0.1:4174/');
  target.search=location.search;
  target.hash=location.hash;
  location.replace(target.href);
}
