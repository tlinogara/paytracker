update public.brand_list
set n = case brand
  when 'Aston Martin' then 500
  when 'Bentley' then 400
  when 'Lamborghini' then 300
  when 'McLaren' then 200
  when 'Rolls-Royce' then 100
  when 'All brands' then 0
  else n
end
where brand in ('Aston Martin', 'Bentley', 'Lamborghini', 'McLaren', 'Rolls-Royce', 'All brands');
