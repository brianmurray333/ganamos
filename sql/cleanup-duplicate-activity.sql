-- Cleanup duplicate activity if needed
-- Only run this if you see duplicate activities for the same transaction

-- First, check what we have
SELECT 
    a.id as activity_id,
    a.timestamp,
    a.metadata,
    t.id as transaction_id,
    t.amount as transaction_amount
FROM activities a
JOIN transactions t ON a.related_id = t.id
WHERE t.payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
ORDER BY a.timestamp DESC;

-- If there are duplicates, delete the older one(s) - keep only the most recent
-- UNCOMMENT THE DELETE BELOW ONLY IF YOU CONFIRM THERE ARE DUPLICATES
/*
DELETE FROM activities
WHERE id IN (
    SELECT a.id
    FROM activities a
    JOIN transactions t ON a.related_id = t.id
    WHERE t.payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
      AND a.type = 'deposit'
      AND a.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
      AND a.id NOT IN (
          -- Keep the most recent one
          SELECT a2.id
          FROM activities a2
          JOIN transactions t2 ON a2.related_id = t2.id
          WHERE t2.payment_request = 'lnbc1m1p54shfcpp5da0jkjp9zq7lhyttlf82agdmalsznv5eg380d0tds6kyjf8que9sdpjg3jhqmmnd96zqvfsxqcrqvpqwdshgueqw3hjq3mpdesk6mmnyycqzzsxqrrsssp55yy8ptvsnafn8sgpgerhlr3799upmjqrjcpeafjdhj3cgy5qvkes9qxpqysgq4xux7meh4c7hs8ae4pal20n5dkwf04qhpage9vhvqffxacncmx2zrfsngn4qdmv0e9es5vpnjndxlejwlvavdtxlpymfd52ep4um66sp2hf0w0'
            AND a2.type = 'deposit'
            AND a2.user_id = 'dce58449-faa0-413e-8b7a-6e607d280beb'
          ORDER BY a2.timestamp DESC
          LIMIT 1
      )
);
*/



