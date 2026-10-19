-- WhoAmI starter decks. Run after schema.sql (SQL Editor > New query > paste > Run).

with d as (
  insert into decks (name, description) values
    ('Movies & TV', 'Characters from films and series'),
    ('Famous people', 'Real people everyone has heard of'),
    ('Cartoons & Games', 'Animated and video game characters')
  returning id, name
)
insert into deck_cards (deck_id, name)
select d.id, c.name
from d
join (values
  ('Movies & TV', 'Harry Potter'), ('Movies & TV', 'Darth Vader'), ('Movies & TV', 'Hermione Granger'),
  ('Movies & TV', 'James Bond'), ('Movies & TV', 'Jack Sparrow'), ('Movies & TV', 'Forrest Gump'),
  ('Movies & TV', 'Walter White'), ('Movies & TV', 'Eleven'), ('Movies & TV', 'Sherlock Holmes'),
  ('Movies & TV', 'Wednesday Addams'), ('Movies & TV', 'Gandalf'), ('Movies & TV', 'Barbie'),
  ('Movies & TV', 'Indiana Jones'), ('Movies & TV', 'Joker'), ('Movies & TV', 'Mr. Bean'),
  ('Movies & TV', 'Rocky Balboa'), ('Movies & TV', 'Jon Snow'), ('Movies & TV', 'Wonder Woman'),
  ('Movies & TV', 'Iron Man'), ('Movies & TV', 'Mary Poppins'),

  ('Famous people', 'Cristiano Ronaldo'), ('Famous people', 'Taylor Swift'), ('Famous people', 'Albert Einstein'),
  ('Famous people', 'Frida Kahlo'), ('Famous people', 'Michael Jackson'), ('Famous people', 'Cleopatra'),
  ('Famous people', 'Leonardo da Vinci'), ('Famous people', 'Beyoncé'), ('Famous people', 'Elon Musk'),
  ('Famous people', 'Marie Curie'), ('Famous people', 'Usain Bolt'), ('Famous people', 'Shakespeare'),
  ('Famous people', 'Lady Gaga'), ('Famous people', 'Napoleon'), ('Famous people', 'Amália Rodrigues'),
  ('Famous people', 'Lionel Messi'), ('Famous people', 'Queen Elizabeth II'), ('Famous people', 'Freddie Mercury'),
  ('Famous people', 'Serena Williams'), ('Famous people', 'Vasco da Gama'),

  ('Cartoons & Games', 'Mario'), ('Cartoons & Games', 'Pikachu'), ('Cartoons & Games', 'SpongeBob'),
  ('Cartoons & Games', 'Shrek'), ('Cartoons & Games', 'Homer Simpson'), ('Cartoons & Games', 'Elsa'),
  ('Cartoons & Games', 'Sonic'), ('Cartoons & Games', 'Mickey Mouse'), ('Cartoons & Games', 'Lara Croft'),
  ('Cartoons & Games', 'Buzz Lightyear'), ('Cartoons & Games', 'Scooby-Doo'), ('Cartoons & Games', 'Link'),
  ('Cartoons & Games', 'Peppa Pig'), ('Cartoons & Games', 'Bugs Bunny'), ('Cartoons & Games', 'Pac-Man'),
  ('Cartoons & Games', 'Simba'), ('Cartoons & Games', 'Kirby'), ('Cartoons & Games', 'Garfield'),
  ('Cartoons & Games', 'Master Chief'), ('Cartoons & Games', 'Moana')
) as c(deck, name) on c.deck = d.name;
