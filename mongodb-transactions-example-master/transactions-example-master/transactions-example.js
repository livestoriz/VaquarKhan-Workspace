// ******
// Config
// ******

// Both client and server

Documents = new Meteor.Collection('documents');

// Custom permission check function

checkPermission = function(userId,doc) {
  return Meteor.user();	
}

// *******************
// Transactions config
// *******************

tx.collectionIndex = {'documents': Documents}; // This is compulsory for the transactions to work

tx.checkPermission = function(action,collection,doc,updates) { return checkPermission(Meteor.userId(),doc); }; // Note -- we're using the same function here that we use for our allow and deny rules

// ***
// App
// ***
  
fieldNames = function() {
  var fieldNames = _.map(_.range(5), function(fieldNumber) { return {field: 'field' + (fieldNumber + 1), name:'Field ' + (fieldNumber + 1)}; });
  return fieldNames;  
}

makeNewDoc = function() {
  var newDoc = {name:'Document ' + (Documents.find().count() + 1),createdAt:Date.now()};
  _.each(fieldNames(),function(fieldName) {
   if (Math.random() < 0.5) {
	 newDoc[fieldName.field] = (Math.random() < 0.5) ? "Click to edit" : (Math.floor((Math.random()) * 100000) + 10000).toString();
   }
  });
  return newDoc;
}
  
Meteor.methods({
  'removeAll' : function() {
	if (Documents.find({deleted:{$exists:false}}).count()) {
      tx.start('remove all documents');
	  _.each(Documents.find({deleted:{$exists:false}}).fetch(), function(doc) {
	    tx.remove(Documents,doc);
	  });
	  tx.commit();
	}
  }
});

if (Meteor.isClient) {

  Accounts.ui.config({
	passwordSignupFields: 'USERNAME_ONLY'
  });

  Meteor.subscribe('documents');
  
  Session.setDefault('fieldBeingEdited',null);
	
  Template.demo.helpers({
	'documents' : function() {
      return Documents.find({deleted:{$exists:false}},{sort:{createdAt:1}});
	},
	'documentCount' : function() {
      return Documents.find({deleted:{$exists:false}}).count();
	},
	'fieldNames' : function () {
	  return fieldNames();
	},
	'fields' : function() {
	  var self = this;
	  return _.map(fieldNames(), function(fieldName,index) {
		return {document_id:self._id,field:fieldName.field,value:self[fieldName.field] || ''};
	  });
	},
	'editing' : function() {
	  return Session.equals('fieldBeingEdited',this.document_id + '_' + this.field);	
	}
  });

  Template.demo.events({
    'click input#add-document': function (evt,tmpl) {
	   tx.insert(Documents,makeNewDoc());
    },
	'click td.edit-field' : function (evt,tmpl) {
	   if (Meteor.user() && !Session.equals('fieldBeingEdited',this.document_id + '_' + this.field)) {
	     Session.set('fieldBeingEdited',this.document_id + '_' + this.field);
	     Deps.flush();
	     $('#edit-field').focus().select();
	   }
	},
	'keydown input#edit-field, focusout input#edit-field' : function(evt,tmpl) {
	  if (evt.type === 'keydown' && evt.which !== 13) {
		return;  
	  }
	  var val = $('input#edit-field').val();
	  if (val !== this.value) {
	    var modifier = {};
		modifier[this.field] = val;
	    tx.update(Documents,this.document_id,{$set:modifier});
	  }
	  Session.set('fieldBeingEdited',null);
	},
	'click .delete' : function() {
	  tx.remove(Documents,this._id);	
	},
	'click .clear-field' : function() {
	  var self = this;
	  var atLeastOneNonEmpty = false;
	  var modifier = {};
	  modifier[self.field] = '';
	  tx.start('clear ' + this.name);
	  _.each(Documents.find({deleted:{$exists:false}}).fetch(),function(doc) {
		if (doc[self.field] !== '') {
		  atLeastOneNonEmpty = true;
		}
		tx.update(Documents,doc,{$set:modifier});
	  });
	  if (!atLeastOneNonEmpty) {
		tx.cancel();  
	  }
	  tx.commit();
	},
	'click #delete-documents' : function() {
	  Meteor.call('removeAll'); // Because updates can only be done by _id and the transactions manager's remove is an update that isn't only by _id
	}
  });
}

if (Meteor.isServer) {
  
  Documents.allow({
	insert: function(userId,doc) { return checkPermission(userId, doc); },
	update: function(userId,doc, fields, modifier) { return checkPermission(userId, doc); },
	remove: function(userId,doc) { return checkPermission(userId, doc); }
  });
  
  Meteor.publish('documents',function() {
	return Documents.find(); 
  });
  
  var resetDocs = function() {
    // Clears out the transactions and documents collections every 24 hours -- DON'T PUT THIS IN YOUR APP!!!
	Documents.remove({});
	tx.Transactions.remove({});
	// Put in seven new docs
	for (i = 1; i <= 7; i++) {
	  Documents.insert(makeNewDoc());
	}
  }
  var MyCron = new Cron(3600000);
  MyCron.addJob(24, function() {
    resetDocs();
  });
  
  resetDocs();
  
}