"use strict";

var app = app || {};

app.Constants = {
    TURN_COUNT: 100,
    Quick: {
        FOOD_TO_GROW_FACTOR: 67,
        COST_FACTOR: 67,
        SETTLER_FACTOR: 65,
        WHIP_HAMMERS: 20
    },
    Normal: {
        FOOD_TO_GROW_FACTOR: 100,
        COST_FACTOR: 100,
        SETTLER_FACTOR: 100,
        WHIP_HAMMERS: 30
    }
}

app.BuildPresets = [
    {name: "Worker", hammers: 60, foodhammers: true},
    {name: "Worker (EXP)", hammers: 60, foodhammers: true, bonus: 25},
    {name: "Work Boat", hammers: 30},
    {name: "Settler", hammers: 100, foodhammers: true},
    {name: "Settler (IMP)", hammers: 100, foodhammers: true, bonus: 50},
    {name: "Warrior", hammers: 15},
    {name: "Scout", hammers: 15},
    {name: "Archer", hammers: 25},
    {name: "Spearman", hammers: 35},
    {name: "Axeman", hammers: 35},
    {name: "Chariot", hammers: 30},
    {name: "Granary", hammers: 60, granary: true},
    {name: "Granary (EXP)", hammers: 60, bonus: 100, granary: true},
    {name: "Monument", hammers: 60},
    {name: "Barracks", hammers: 60},
    {name: "Library", hammers: 60}

];

app.ActionPresets = [
    {code: "removeAll", name: "(Remove all actions)"},
    {code: "revolt", name: "Revolt"},
    {code: "chop-20", name: "Chop (20 hammers)"},
    {code: "chop-30", name: "Chop (30 hammers)"},
    {code: "whip-1", name: "Whip (1 pop)"},
    {code: "whip-2", name: "Whip (2 pop)"},
    {code: "whip-3", name: "Whip (3 pop)"},
    {code: "whip-4", name: "Whip (4 pop)"}
];

app.City = Backbone.Model.extend({
    defaults: function() {
        return {
            startTurn: 0,
            startPop: 1,
            startFood: 0,
            startHammers: 0,
            speed: "Normal",
            isCapital: true,
            isFinancial: false
        };
    },
    initialize: function() {
        this.turns = new app.CityTurnList();
        for(var i=0; i<app.Constants.TURN_COUNT; i++) {
            var turn = new app.CityTurn();
            turn.prev = (i >= 1) ? this.turns.at(i-1) : null;
            turn.city = this;
            turn.index = i;
            this.turns.add(turn);
        }
    },
    save: function(filename) {
        if (filename == '') {
            return false;
        }
        console.log("save %s", filename);
        localStorage.setItem('city-' + filename, JSON.stringify(this.toJSON()));
    },
    load: function(filename) {
        if (filename == '') {
            return false;
        }
        console.log("load %s", filename);
        var encoded = JSON.parse(localStorage.getItem('city-' + filename));
        this.setFromJSON(encoded);

        this.recalc();
    },
    recalc: function() {
        var firstTurn = this.turns.at(0);
        firstTurn.set("turn", this.get("startTurn"));
        firstTurn.set("pop", this.get("startPop"));
        firstTurn.set("food", this.get("startFood"));

        for(var i=1; i<app.Constants.TURN_COUNT; i++) {
            var turn = this.turns.at(i);
            turn.calculateFromPrevious();
        }
        this.trigger('reset');
    },
    propagateTileSelections: function(startIndex) {
        var selected = this.turns.at(startIndex).selectedTiles;
        for(var i=startIndex+1; i<app.Constants.TURN_COUNT; i++) {
            this.turns.at(i).selectedTiles = _.clone(selected);
        }

        this.recalc();
    },
    propagateTileChanges: function(startIndex) {
        var grid = this.turns.at(startIndex).tileGrid;
        for(var i=startIndex+1; i<app.Constants.TURN_COUNT; i++) {
            this.turns.at(i).tileGrid.setTiles(grid);
        }

        this.recalc();
    },
    propagateBuild: function(startIndex) {
        var build = this.turns.at(startIndex).build;
        for(var i=startIndex+1; i<app.Constants.TURN_COUNT; i++) {
            this.turns.at(i).build = _.clone(build);
        }

        this.recalc();
    },
    setSpeed: function(speed) {
        this.set("speed", speed);
        this.recalc();
    },
    setStartTurn: function(startTurn) {
        this.set("startTurn", startTurn);
        this.recalc();
    },
    setIsCapital: function(isCapital) {
        this.set("isCapital", isCapital);
        this.recalc();
    },
    setIsFinancial: function(isFinancial) {
        this.set("isFinancial", isFinancial);
        this.recalc();
    },
    toJSON: function() {
        var encoded = {};
        for(var i=0; i<app.Constants.TURN_COUNT; i++) {
            encoded['t' + i] = this.turns.at(i).toJSON();
        }
        encoded.attributes = this.attributes;
        return encoded;
    },
    setFromJSON: function(encoded) {
        for(var i=0; i<app.Constants.TURN_COUNT; i++) {
            this.turns.at(i).setFromJSON(encoded['t' + i]);
        }
        this.attributes = encoded.attributes;
        return encoded;
    }
});

app.CityTurn = Backbone.Model.extend({
    defaults: function() {
        return {
            turn: 0,
            pop: 1,
            food: 0,
            overflowHammers: 0,
            granary: false,
            granaryFood: 0,
            userNote:  ''
        };
    },
    initialize: function() {
        this.tileGrid = new app.TileGrid();
        this.tileGrid.turn = this;
        this.selectedTiles = {"2,2": true};
        this.build = {};
        this.buildHammers = {};
        this.actions = [];
        this.totals = {"h": 0, "c": 0};
    },
    calculateFromPrevious: function() {
        var prevInfo = this.prev.info();
        var attrs = {};

        attrs.turn = prevInfo.turn + 1;

        attrs.granary = prevInfo.granary;
        attrs.granaryFood = 0;

        // FOOD
        var growth = 0;
        attrs.food = prevInfo.food + prevInfo.foodSurplus;
        if (prevInfo.granary) {
            attrs.granaryFood += prevInfo.granaryFood + prevInfo.foodSurplus;
        }
        if (attrs.food >= prevInfo.foodToGrow) {
            growth = 1;
            attrs.food += Math.min(attrs.granaryFood, prevInfo.foodToGrow / 2);
            attrs.food -= prevInfo.foodToGrow;
        }
        attrs.pop = prevInfo.pop + growth;
        // (whips)
        if (this.popWhipped() > 0) {
            attrs.pop -= this.popWhipped();
        }

        // HAMMERS
        this.buildHammers = _.clone(prevInfo.buildHammers);
        if(this.prev.hasRevolt()) {
            this.attributes.overflowHammers = prevInfo.overflowHammers; // Revolts carry overflow forward
        } else {
            this.attributes.overflowHammers = 0;
        }
        if(prevInfo.build.name) {
            this.buildHammers[prevInfo.build.name] += prevInfo.hammersProduced;
            if (this.buildHammers[prevInfo.build.name] >= prevInfo.build.hammers) {
                // Build finished
                this.attributes.overflowHammers = this.buildHammers[prevInfo.build.name] - prevInfo.build.hammers;
                if (prevInfo.build.bonus) {
                    this.attributes.overflowHammers = Math.floor(
                        (this.attributes.overflowHammers / (1 + prevInfo.build.bonus / 100)));
                }
                // Overflow can only be up to the amount of hammers built.
                this.attributes.overflowHammers = Math.min(this.attributes.overflowHammers, prevInfo.build.hammers);
                this.buildHammers[prevInfo.build.name] = 0;

                // Granary?
                if (prevInfo.build.granary) {
                    attrs.granary = true;
                }
            }
        }

        // COTTAGES
        var thisGrid = this.tileGrid;
        $.each(this.prev.selectedTileList(), function(k, tile) {
            if (thisGrid.cottageLevel(tile.ct) > 0) {
                var newTile = thisGrid.getTile(tile.x, tile.y);
                newTile.ct = tile.ct + 1;
                thisGrid.setTile(tile.x, tile.y, newTile);
            }
        });
        // Subtract overflow hammers, otherwise we'd double-count them in the total.
        this.totals.h = prevInfo.totals.h + prevInfo.hammersProduced - this.attributes.overflowHammers;
        this.totals.c = prevInfo.totals.c + prevInfo.commerceProduced;

        this.set(attrs);
    },
    info: function() {
        var info = this.attributes;
        info.build = this.build;
        info.buildHammers = this.buildHammers;
        info.totals = this.totals;

        // Output derived from tiles
        info.foodWorked = 0;
        info.hammersProduced = 0;
        info.commerceProduced = 0;

        $.each(this.selectedTileList(), function(k, tile) {
            info.foodWorked += tile.f;
            info.hammersProduced += tile.h;
            info.commerceProduced += tile.netCommerce;
        });
        if (this.city.get('isCapital')) {
            info.commerceProduced += 8 + 1; // One extra, to simulate the free science beaker.
        }

        // Derived food info
        info.foodCost = info.pop * 2;
        info.foodSurplus = (info.build.foodhammers && info.foodWorked > info.foodCost) ? 0 : info.foodWorked - info.foodCost;
        if (this.hasRevolt()) {
            info.foodSurplus = 0;
        }
        info.foodToGrow = Math.floor((2*info.pop + 20) * app.Constants[this.city.get('speed')].FOOD_TO_GROW_FACTOR / 100);
        info.popWhipped = this.popWhipped();

        // Derived hammer info
        info.hammersProduced += info.overflowHammers;
        if (info.popWhipped > 0) {
            info.hammersProduced += info.popWhipped * app.Constants[this.city.get('speed')].WHIP_HAMMERS;
        }
        info.hammersProduced += this.hammersChopped();
        if (info.build.bonus) {
            info.hammersProduced += Math.floor(info.hammersProduced * info.build.bonus / 100);
        }
        if (info.build.foodhammers && info.foodWorked > info.foodCost) {
            info.hammersProduced += info.foodWorked - info.foodCost;
        }
        if (this.hasRevolt()) {
            info.hammersProduced = 0;
            info.commerceProduced = 0;
        }

        if(info.build.name && !info.buildHammers[info.build.name]) {
            info.buildHammers[info.build.name] = 0;
        }
        info.hammers = info.buildHammers[this.build.name];
        info.buildFinished = (info.buildHammers[info.build.name] + info.hammersProduced >= info.build.hammers);

        return info;
    },
    numberSelected: function() {
        return _.keys(this.selectedTiles).length;
    },
    isTileSelected: function(x, y) {
        var key = x + "," + y;
        return (key in this.selectedTiles);
    },
    selectedTileList: function() {
        var result = [];

        for(var x=0; x<5; x++) {
            for(var y=0;  y<5; y++) {
                var key = x + ',' + y;
                if (key in this.selectedTiles) {
                    result.push(this.tileGrid.getTile(x,y));
                }
            }
        }
        return result;
    },
    selectTile: function(x, y) {
        var key = x + "," + y;
        if (key in this.selectedTiles) {
            return false;
        }
        if (this.numberSelected() >= this.get('pop') + 1) {
            return false;
        }

        this.selectedTiles[key] = true;

        this.city.propagateTileSelections(this.index);
        this.trigger('change');

        return true;
    },
    unselectTile: function(x, y) {
        var key = x + "," + y;
        if (key == '2,2' || !(key in this.selectedTiles)) {
            return false;
        }
        delete this.selectedTiles[key];

        this.city.propagateTileSelections(this.index);
        this.trigger('change');

        return true;
    },
    buildPresetForName: function(name) {
        var foundPreset = null;
        var speed = this.city.get('speed');
        $.each(app.BuildPresets, function(k, preset) {
            if (preset.name == name) {
                foundPreset = _.clone(preset);
                // Modify hammers for game speed.
                if (foundPreset.name.match(/^Settler/)) {
                    // Settlers are special.
                    foundPreset.hammers = Math.floor(foundPreset.hammers * app.Constants[speed].SETTLER_FACTOR / 100);
                } else {
                    foundPreset.hammers = Math.floor(foundPreset.hammers * app.Constants[speed].COST_FACTOR / 100);
                }
            }
        });

        return foundPreset;
    },
    popWhipped: function() {
        var result = 0;
        $.each(this.actions, function(k, action) {
            var found = action.match(/^whip-(\d+)/);
            if (found) {
                result += parseInt(found[1]);
            }
        });
        return result;
    },
    hasRevolt: function() {
        var result = false;
        $.each(this.actions, function(k, action) {
            if (action == 'revolt') {
                result = true;
            }
        });
        return result;
    },
    hammersChopped: function() {
        var result = 0;
        $.each(this.actions, function(k, action) {
            var found = action.match(/chop-(\d+)/);
            if (found) {
                result += parseInt(found[1]);
            }
        });
        return result;
    },
    actionPresetForCode: function(code) {
        var foundPreset = null;
        $.each(app.ActionPresets, function(k, preset) {
            if (preset.code == code) {
                foundPreset = preset;
            }
        });
        return foundPreset;
    },
    setBuild: function(params) {
        this.build = {name: params.name, hammers: params.hammers, bonus: params.bonus, }
        // Already a preset? Get the "hidden" info, like whether the build is foodhammers
        var preset = this.buildPresetForName(params.name);
        if (preset && preset.foodhammers) {
            this.build.foodhammers = true;
        }
        if (preset && preset.granary) {
            this.build.granary = true;
        }
        this.city.propagateBuild(this.index);
        this.trigger('change');
    },
    addAction: function(actionCode) {
        if (actionCode == 'removeAll') {
            this.actions.length = 0;
        } else {
            this.actions.push(actionCode);
        }
        this.trigger('change');
        this.city.recalc();
    },
    toJSON: function() {
        var result = {
            selectedTiles: this.selectedTiles,
            build: this.build,
            actions: this.actions,
            userNote: this.get('userNote')
        };
        if (!this.prev || !this.tileGrid.equals(this.prev.tileGrid)) {
            // To save space only store first turn's tiles and when something significant changed.
            result.tileGrid = this.tileGrid.tiles;
        }
        return result;
    },
    setFromJSON: function(encoded) {
        if (encoded.tileGrid) {
            this.tileGrid.setTilesFromArray(encoded.tileGrid);
        } else {
            this.tileGrid.setTiles(this.prev.tileGrid);
        }
        this.selectedTiles = encoded.selectedTiles;
        this.build = encoded.build;
        this.actions = encoded.actions || [];
        this.set('userNote', encoded.userNote || '');
    }
});

app.CityTurnList = Backbone.Collection.extend({
    model: app.CityTurn
    //url: '/sequence/sequence/'
});


app.TileGrid = Backbone.Model.extend({
    getTile: function(x, y) {
        var result = _.clone(this.tiles[x][y]);
        result.x = x;
        result.y = y;
        result.valid = !((x==0 || x==4) && (y==0 || y==4)) // Corners are not valid selections
        result.netCommerce = this.netCommerce(result.c, result.ct);
        return result;
    },
    setTile: function(x, y, attrs) {
        this.tiles[x][y].f = attrs.f;
        this.tiles[x][y].h = attrs.h;
        this.tiles[x][y].c = attrs.c;
        this.tiles[x][y].ct = attrs.ct;

        this.trigger('change');
    },
    setTiles: function(sourceTileGrid) {
        for(var x=0; x<5; x++) {
            for(var y=0;  y<5; y++) {
                this.setTile(x, y, sourceTileGrid.getTile(x,y));
            }
        }
    },
    setTilesFromArray: function(arr) {
        for(var x=0; x<5; x++) {
            for(var y=0;  y<5; y++) {
                this.setTile(x, y, arr[x][y]);
            }
        }
    },
    equals: function(otherTileGrid) {
        for(var x=0; x<5; x++) {
            for(var y=0;  y<5; y++) {
                if (this.tiles[x][y].f != otherTileGrid.tiles[x][y].f ||
                        this.tiles[x][y].h != otherTileGrid.tiles[x][y].h ||
                        this.tiles[x][y].c != otherTileGrid.tiles[x][y].c ||
                        this.cottageLevel(this.tiles[x][y].ct) != this.cottageLevel(otherTileGrid.tiles[x][y].ct)) {
                    return false;
                }
            }
        }
        return true;
    },
    cottageLevel: function(ct) {
        var factor = app.Constants[this.turn.city.get('speed')].FOOD_TO_GROW_FACTOR;
        if (ct === null || isNaN(parseInt(ct))) {
            return 0;
        }
        ct -= Math.floor(10 * factor / 100);
        if (ct < 0) { // Cottage
            return 1;
        }
        ct -= Math.floor(20 * factor / 100);
        if (ct < 0) { // Village
            return 2;
        }
        ct -= Math.floor(40 * factor / 100);
        if (ct < 0) { // Hamlet
            return 3;
        }
        return 4; // Town
    },
    cottageGrowth: function(otherTileGrid) {
        for(var x=0; x<5; x++) {
            for(var y=0;  y<5; y++) {
                var cl1 = this.cottageLevel(this.tiles[x][y].ct);
                var cl2 = otherTileGrid.cottageLevel(otherTileGrid.tiles[x][y].ct);
                if (cl2 > 0 && cl1 > cl2) {
                    return true;
                }
            }
        }
        return false;
    },
    netCommerce: function(base, cottageTurns) {
        var result = base;
        result += this.cottageLevel(cottageTurns);
        if (result >= 2 && this.turn.city.get('isFinancial')) {
            result += 1;
        }
        return result;
    },
    initialize: function() {
        this.tiles = [];
        for(var x=0; x<5; x++) {
            var col = []
            for(var y=0;  y<5; y++) {
                var tile = {
                    "f": 0,
                    "h": 0,
                    "c": 0,
                    "ct": null
                };

                if (x==2 && y==2) {
                    tile.f = 2;
                    tile.h = 1;
                    tile.c = 1;
                }
                col.push(tile);
            }
            this.tiles.push(col);
        }
    }
});